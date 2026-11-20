// public/js/auditoria.js — Cliente para Pantalla C.26: Bitácora de auditoría forense y reportes de control
(function () {
  'use strict';

  // --- Estado del cliente ---
  let cursorSiguiente = null;
  let cargando = false;
  let registrosEnMemoria = new Map();
  let totalRegistrosVisualizados = 0;
  let modalInstancia = null;

  // --- Elementos del DOM ---
  let filtroUsuario;
  let filtroAccion;
  let filtroTabla;
  let filtroDesde;
  let filtroHasta;
  let filtroRegistro;
  let btnExportarCSV;
  let tbodyAuditoria;
  let btnCargarMas;
  let estadoCarga;
  let sinRegistros;
  let conteoRegistros;
  let badgeTotalRegistros;
  let metricaEventos;
  let metricaAccesosHC;
  let metricaConfidenciales;
  let metricaUsuarios;
  let modalDetalleEl;
  let modalContenidoEl;

  // --- Utilidades de Formato y Fecha ---
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function aFechaISO(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatearFechaHora(fechaStr) {
    if (!fechaStr) return '—';
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return String(fechaStr);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function escapeHtml(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatearUsuario(usuario) {
    if (!usuario) return 'sistema';
    if (typeof usuario === 'object') {
      if (usuario.email) return usuario.email.split('@')[0];
      return usuario.nombre || 'usuario';
    }
    const str = String(usuario).trim();
    if (str.includes('@')) {
      return str.split('@')[0];
    }
    return str;
  }

  function obtenerClaseBadgeAccion(accion) {
    switch ((accion || '').toUpperCase()) {
      case 'INSERT':
        return 'badge-accion-insert';
      case 'UPDATE':
        return 'badge-accion-update';
      case 'DELETE':
        return 'badge-accion-delete';
      case 'SELECT_CONFIDENTIAL':
        return 'badge-accion-confidential';
      case 'LOGIN':
        return 'badge-accion-login';
      case 'LOGOUT':
        return 'badge-accion-logout';
      case 'LOGIN_FALLIDO':
        return 'badge-accion-login-fallido';
      case 'ACCESO_DENEGADO':
        return 'badge-accion-denegado';
      default:
        return 'bg-secondary';
    }
  }

  function generarResumenDetalle(row) {
    if (row.resumen && typeof row.resumen === 'string') return row.resumen;

    let det = row.detalle;
    if (typeof det === 'string') {
      try {
        det = JSON.parse(det);
      } catch (_) {
        // Detalle en texto plano
      }
    }

    if (det && typeof det === 'object') {
      if (det.antes && det.despues) {
        const modificados = [];
        const antes = det.antes || {};
        const despues = det.despues || {};
        const claves = Array.from(new Set([...Object.keys(antes), ...Object.keys(despues)]));
        claves.forEach(k => {
          if (JSON.stringify(antes[k]) !== JSON.stringify(despues[k])) {
            modificados.push(k);
          }
        });
        if (modificados.length > 0) {
          return `Campos: ${modificados.slice(0, 3).join(', ')}${modificados.length > 3 ? '...' : ''}`;
        }
        return 'Sin modificaciones de valor';
      }
      if (det.despues && !det.antes) {
        const id = det.despues.id || det.despues.codigo || det.despues.nombre || '';
        return `Nuevo registro ${id ? `(${id})` : ''}`.trim();
      }
      if (det.antes && !det.despues) {
        const id = det.antes.id || det.antes.codigo || '';
        return `Registro eliminado ${id ? `(${id})` : ''}`.trim();
      }
      if (det.motivo) return `Motivo: ${det.motivo}`;
      if (det.filtros) return `Filtros: ${JSON.stringify(det.filtros)}`;
      return JSON.stringify(det);
    }

    if (row.registro_id) {
      return `Reg: ${row.registro_id}`;
    }

    return row.detalle ? String(row.detalle).substring(0, 70) : 'Sin detalle adicional';
  }

  // --- Construcción de Parámetros ---
  function obtenerFiltrosValores() {
    return {
      usuario: filtroUsuario ? filtroUsuario.value.trim() : '',
      accion: filtroAccion ? filtroAccion.value.trim() : '',
      tabla: filtroTabla ? filtroTabla.value.trim() : '',
      desde: filtroDesde ? filtroDesde.value.trim() : '',
      hasta: filtroHasta ? filtroHasta.value.trim() : '',
      registro: filtroRegistro ? filtroRegistro.value.trim() : '',
    };
  }

  function construirParamsURL(esPaginacion = false) {
    const filtros = obtenerFiltrosValores();
    const params = new URLSearchParams();

    if (filtros.usuario) params.set('usuario', filtros.usuario);
    if (filtros.accion) params.set('accion', filtros.accion);
    if (filtros.tabla) params.set('tabla', filtros.tabla);
    if (filtros.desde) params.set('desde', filtros.desde);
    if (filtros.hasta) params.set('hasta', filtros.hasta);
    if (filtros.registro) params.set('registro', filtros.registro);

    if (esPaginacion && cursorSiguiente) {
      params.set('cursor', cursorSiguiente);
    }

    return params;
  }

  function validarRangoFechas(desde, hasta) {
    if (!desde || !hasta) return true;
    const dDesde = new Date(desde);
    const dHasta = new Date(hasta);

    if (dDesde > dHasta) {
      window.HIS.mostrarMensaje('danger', 'La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
      return false;
    }

    const diffDias = Math.floor((dHasta - dDesde) / (1000 * 60 * 60 * 24));
    if (diffDias > 92) {
      window.HIS.mostrarMensaje('danger', 'El rango de consulta no puede ser superior a 92 días.');
      return false;
    }

    return true;
  }

  // --- Renderizado de Filas de Auditoría ---
  function renderizarFila(row) {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.dataset.id = row.id;

    const fechaFormateada = formatearFechaHora(row.fecha);
    const usuarioBadge = escapeHtml(formatearUsuario(row.usuario || row.usuario_id));
    const ipOrigen = escapeHtml(row.ip_origen || '10.10.2.31');
    const claseBadge = obtenerClaseBadgeAccion(row.accion);
    const accionTexto = escapeHtml(row.accion || 'EVENTO');
    const tablaAfectada = escapeHtml(row.tabla_afectada || '—');
    const resumenTexto = escapeHtml(generarResumenDetalle(row));

    tr.innerHTML = `
      <td class="font-monospace text-nowrap">${fechaFormateada}</td>
      <td data-trace="C26-30">
        <span class="badge bg-light text-dark border font-monospace" data-trace="C26-30">${usuarioBadge}</span>
      </td>
      <td class="font-monospace text-secondary small" data-trace="C26-31">${ipOrigen}</td>
      <td data-trace="C26-32">
        <span class="badge ${claseBadge} rounded-pill font-monospace" data-trace="C26-35">${accionTexto}</span>
      </td>
      <td class="font-monospace small text-dark fw-medium" data-trace="C26-33">${tablaAfectada}</td>
      <td data-trace="C26-34">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <span class="text-truncate text-secondary" style="max-width: 260px;" title="${resumenTexto}">${resumenTexto}</span>
          <button type="button" class="btn btn-outline-primary btn-xs text-nowrap btn-ver-detalle" data-trace="C26-36" data-id="${row.id}">
            Ver detalle
          </button>
        </div>
      </td>
    `;

    // Clic en la fila o en el botón abre el modal forense
    tr.addEventListener('click', (e) => {
      abrirModalDetalle(row.id);
    });

    return tr;
  }

  // --- Consulta de Bitácora (Keyset Pagination) ---
  async function consultarBitacora(esPaginacion = false) {
    const filtros = obtenerFiltrosValores();

    if (!validarRangoFechas(filtros.desde, filtros.hasta)) {
      return;
    }

    if (cargando) return;
    cargando = true;

    if (!esPaginacion) {
      if (window.HIS && typeof window.HIS.destruirDataTable === 'function') {
        window.HIS.destruirDataTable('#tablaAuditoria');
      }
      cursorSiguiente = null;
      registrosEnMemoria.clear();
      totalRegistrosVisualizados = 0;
      tbodyAuditoria.innerHTML = '';
      sinRegistros.style.display = 'none';
      btnCargarMas.style.display = 'none';
      estadoCarga.style.display = 'block';
      conteoRegistros.textContent = 'Consultando eventos...';
    } else {
      btnCargarMas.disabled = true;
      estadoCarga.style.display = 'block';
    }

    try {
      const params = construirParamsURL(esPaginacion);
      const res = await window.HIS.api(`/api/auditoria?${params.toString()}`);
      const data = (res && res.data !== undefined) ? res.data : (res || {});
      const filas = Array.isArray(data.filas) ? data.filas : (Array.isArray(data) ? data : []);

      cursorSiguiente = data.siguiente || null;

      const tablaContenedor = tbodyAuditoria.closest('.table-responsive');

      if (!esPaginacion && filas.length === 0) {
        if (tablaContenedor) tablaContenedor.style.display = 'none';
        sinRegistros.style.display = 'flex';
        conteoRegistros.textContent = '0 registros encontrados';
        badgeTotalRegistros.textContent = '0';
      } else {
        if (tablaContenedor) tablaContenedor.style.display = '';
        sinRegistros.style.display = 'none';
        const fragment = document.createDocumentFragment();

        filas.forEach(row => {
          registrosEnMemoria.set(row.id, row);
          fragment.appendChild(renderizarFila(row));
        });

        tbodyAuditoria.appendChild(fragment);
        totalRegistrosVisualizados += filas.length;

        if (window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
          window.HIS.inicializarDataTable('#tablaAuditoria', { paging: false, info: false, searching: true, ordering: true });
        }

        badgeTotalRegistros.textContent = String(totalRegistrosVisualizados);
        conteoRegistros.textContent = `Mostrando ${totalRegistrosVisualizados} registro${totalRegistrosVisualizados === 1 ? '' : 's'}`;
      }

      window.HIS?.anunciarCambio?.(`Bitácora de auditoría actualizada: ${totalRegistrosVisualizados} registros visibles.`);

      // Control del botón de paginación keyset
      if (cursorSiguiente) {
        btnCargarMas.style.display = 'inline-block';
        btnCargarMas.disabled = false;
      } else {
        btnCargarMas.style.display = 'none';
      }
    } catch (err) {
      console.error('Error al consultar bitácora de auditoría:', err);
      if (err.status === 422) {
        const msg = (err.datos && err.datos.mensaje) || err.message || 'El rango de fechas no puede ser superior a 92 días.';
        window.HIS.mostrarMensaje('danger', msg);
      } else if (err.status === 403) {
        window.HIS.mostrarMensaje('danger', 'Acceso denegado: se requiere permiso auditoria:L.');
      } else {
        window.HIS.mostrarMensaje('danger', err.message || 'Error al consultar la bitácora de auditoría.');
      }
    } finally {
      cargando = false;
      estadoCarga.style.display = 'none';
      btnCargarMas.disabled = false;
    }
  }

  // --- Consulta de Métricas de Control ---
  async function consultarResumen() {
    const filtros = obtenerFiltrosValores();
    if (!validarRangoFechas(filtros.desde, filtros.hasta)) return;

    try {
      const params = construirParamsURL(false);
      const res = await window.HIS.api(`/api/auditoria/resumen?${params.toString()}`);
      const data = (res && res.data !== undefined) ? res.data : (res || {});

      metricaEventos.textContent = Number(data.eventos || 0).toLocaleString();
      metricaAccesosHC.textContent = Number(data.accesosHC || 0).toLocaleString();
      metricaConfidenciales.textContent = Number(data.confidenciales || 0).toLocaleString();
      metricaUsuarios.textContent = Number(data.usuarios || 0).toLocaleString();
    } catch (err) {
      console.warn('No se pudo cargar el reporte de control resumen:', err);
      // Mantener en 0 si falla
    }
  }

  // --- Modal Forense Antes / Después ---
  async function abrirModalDetalle(id) {
    if (!modalInstancia && window.bootstrap && window.bootstrap.Modal) {
      modalInstancia = window.bootstrap.Modal.getOrCreateInstance(modalDetalleEl);
    }

    modalContenidoEl.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Cargando...</span>
        </div>
        <p class="text-muted small mt-2 mb-0">Recuperando registro forense inmutable...</p>
      </div>
    `;

    if (modalInstancia) {
      modalInstancia.show();
    }

    let registro = registrosEnMemoria.get(id);

    try {
      const res = await window.HIS.api(`/api/auditoria/${id}`);
      const datos = (res && res.data !== undefined) ? res.data : (res || {});
      if (datos && datos.id) {
        registro = datos;
        registrosEnMemoria.set(id, registro);
      }
    } catch (e) {
      console.warn('Usando registro en memoria para visualización de detalle:', e);
    }

    if (!registro) {
      modalContenidoEl.innerHTML = `
        <div class="alert alert-danger mb-0">No se pudo cargar el detalle del registro solicitado.</div>
      `;
      return;
    }

    renderizarDetalleForense(registro);
  }

  function renderizarDetalleForense(registro) {
    const fechaHora = formatearFechaHora(registro.fecha);
    const usuario = escapeHtml(registro.usuario || registro.usuario_id || 'Sistema');
    const ip = escapeHtml(registro.ip_origen || '127.0.0.1');
    const accion = escapeHtml(registro.accion || 'ACCION');
    const claseBadge = obtenerClaseBadgeAccion(registro.accion);
    const tabla = escapeHtml(registro.tabla_afectada || '—');
    const regId = escapeHtml(registro.registro_id || 'N/A');

    let det = registro.detalle;
    if (typeof det === 'string') {
      try {
        det = JSON.parse(det);
      } catch (_) {}
    }

    let comparativaHTML = '';

    if (det && typeof det === 'object' && (det.antes || det.despues)) {
      const antes = det.antes || {};
      const despues = det.despues || {};
      const todasLasClaves = Array.from(new Set([...Object.keys(antes), ...Object.keys(despues)])).sort();

      let filasDiff = '';
      let huboCambios = false;

      todasLasClaves.forEach(campo => {
        const valAntes = antes[campo];
        const valDespues = despues[campo];
        const strAntes = valAntes !== undefined ? JSON.stringify(valAntes, null, 2) : undefined;
        const strDespues = valDespues !== undefined ? JSON.stringify(valDespues, null, 2) : undefined;

        if (strAntes === undefined && strDespues !== undefined) {
          // Campo Agregado
          huboCambios = true;
          filasDiff += `
            <tr class="diff-fila-cambio">
              <td class="fw-bold text-dark font-monospace small">${escapeHtml(campo)}</td>
              <td class="text-muted fst-italic small"><em>(no existía)</em></td>
              <td class="diff-cell-agregado font-monospace small">
                <span class="badge bg-success-subtle text-success border border-success-subtle me-1">+ Agregado</span>
                ${escapeHtml(strDespues)}
              </td>
            </tr>
          `;
        } else if (strAntes !== undefined && strDespues === undefined) {
          // Campo Eliminado
          huboCambios = true;
          filasDiff += `
            <tr class="diff-fila-cambio">
              <td class="fw-bold text-dark font-monospace small">${escapeHtml(campo)}</td>
              <td class="diff-cell-eliminado font-monospace small">
                <span class="badge bg-danger-subtle text-danger border border-danger-subtle me-1">- Eliminado</span>
                ${escapeHtml(strAntes)}
              </td>
              <td class="text-muted fst-italic small"><em>(eliminado)</em></td>
            </tr>
          `;
        } else if (strAntes !== strDespues) {
          // Campo Modificado
          huboCambios = true;
          filasDiff += `
            <tr class="diff-fila-cambio">
              <td class="fw-bold text-dark font-monospace small">${escapeHtml(campo)}</td>
              <td class="diff-cell-cambio-antes font-monospace small">${escapeHtml(strAntes)}</td>
              <td class="diff-cell-cambio-despues font-monospace small">
                <span class="badge bg-primary-subtle text-primary border border-primary-subtle me-1">~ Modificado</span>
                ${escapeHtml(strDespues)}
              </td>
            </tr>
          `;
        } else {
          // Campo Sin Cambios
          filasDiff += `
            <tr class="diff-fila-sin-cambio text-muted">
              <td class="text-secondary font-monospace small">${escapeHtml(campo)}</td>
              <td class="font-monospace small opacity-75">${escapeHtml(strAntes)}</td>
              <td class="font-monospace small opacity-75">${escapeHtml(strDespues)}</td>
            </tr>
          `;
        }
      });

      comparativaHTML = `
        <div class="card border border-light-subtle rounded-3 mb-3">
          <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
            <span class="fw-semibold small text-dark">Comparativa forense: Antes vs. Después</span>
            <div class="form-check form-switch mb-0">
              <input class="form-check-input" type="checkbox" id="chkSoloCambios" checked>
              <label class="form-check-label small text-secondary" for="chkSoloCambios">Ocultar campos sin cambios</label>
            </div>
          </div>
          <div class="table-responsive" style="max-height: 380px;">
            <table class="table table-sm align-middle mb-0" id="tablaDiffForense">
              <thead class="table-light small">
                <tr>
                  <th style="width: 25%;">Campo</th>
                  <th style="width: 37.5%;">Antes</th>
                  <th style="width: 37.5%;">Después</th>
                </tr>
              </thead>
              <tbody>
                ${filasDiff}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      // Detalle JSON estructurado
      const jsonStr = det ? JSON.stringify(det, null, 2) : 'Sin carga de detalle adicional.';
      comparativaHTML = `
        <div class="card border border-light-subtle rounded-3 mb-3">
          <div class="card-header bg-white py-2">
            <span class="fw-semibold small text-dark">Detalle del evento</span>
          </div>
          <div class="card-body p-2 bg-light">
            <pre class="mb-0 font-monospace small text-dark" style="max-height: 320px; overflow-y: auto;"><code>${escapeHtml(jsonStr)}</code></pre>
          </div>
        </div>
      `;
    }

    modalContenidoEl.innerHTML = `
      <!-- Cabecera de Metadata del Evento -->
      <div class="row g-2 mb-3 bg-light p-2 rounded-3 border border-light-subtle small">
        <div class="col-6 col-md-4">
          <span class="text-secondary d-block">ID de Evento:</span>
          <span class="font-monospace text-dark fw-semibold text-break">${escapeHtml(registro.id)}</span>
        </div>
        <div class="col-6 col-md-4">
          <span class="text-secondary d-block">Fecha y hora:</span>
          <span class="font-monospace text-dark fw-semibold">${fechaHora}</span>
        </div>
        <div class="col-6 col-md-4">
          <span class="text-secondary d-block">Acción:</span>
          <span class="badge ${claseBadge} rounded-pill font-monospace">${accion}</span>
        </div>
        <div class="col-6 col-md-4">
          <span class="text-secondary d-block">Usuario responsable:</span>
          <span class="font-monospace text-dark fw-semibold">${usuario}</span>
        </div>
        <div class="col-6 col-md-4">
          <span class="text-secondary d-block">IP Origen:</span>
          <span class="font-monospace text-secondary">${ip}</span>
        </div>
        <div class="col-6 col-md-4">
          <span class="text-secondary d-block">Tabla / Registro:</span>
          <span class="font-monospace text-dark">${tabla} (${regId})</span>
        </div>
      </div>

      <!-- Comparativa Forense o JSON -->
      ${comparativaHTML}
    `;

    // Interacción del switch para alternar campos sin cambios
    const chkSoloCambios = document.getElementById('chkSoloCambios');
    if (chkSoloCambios) {
      const filasSinCambio = modalContenidoEl.querySelectorAll('.diff-fila-sin-cambio');
      const toggleFilas = () => {
        filasSinCambio.forEach(f => {
          f.style.display = chkSoloCambios.checked ? 'none' : '';
        });
      };
      chkSoloCambios.addEventListener('change', toggleFilas);
      toggleFilas(); // Inicialmente ocultos
    }
  }

  // --- Exportación a CSV ---
  function exportarCSV() {
    const filtros = obtenerFiltrosValores();
    if (!validarRangoFechas(filtros.desde, filtros.hasta)) return;

    const params = construirParamsURL(false);
    window.location.href = `/api/auditoria/exportar.csv?${params.toString()}`;
  }

  // --- Carga dinámica opcional de usuarios en el select ---
  async function sincronizarCatalogoUsuarios() {
    if (!filtroUsuario) return;
    try {
      const res = await window.HIS.api('/api/usuarios?limite=100');
      const data = (res && res.data !== undefined) ? res.data : (res || {});
      const lista = data.filas || data || [];

      if (Array.isArray(lista) && lista.length > 0) {
        const valActual = filtroUsuario.value;
        // Solo agregar los que no estén ya
        lista.forEach(u => {
          const yaExiste = Array.from(filtroUsuario.options).some(o => o.value === u.id);
          if (!yaExiste) {
            const opt = document.createElement('option');
            opt.value = u.id;
            const alias = u.email ? ` (${u.email.split('@')[0]})` : '';
            opt.textContent = `${u.nombre || u.email}${alias}`;
            filtroUsuario.appendChild(opt);
          }
        });
        if (valActual) filtroUsuario.value = valActual;
        if (window.HIS && typeof window.HIS.inicializarSelect2 === 'function') {
          window.HIS.inicializarSelect2(filtroUsuario);
        }
      }
    } catch (_) {
      // Si no tiene permisos de admin, no bloquear la pantalla
    }
  }

  // --- Inicialización Principal ---
  function inicializar() {
    filtroUsuario = document.getElementById('filtroUsuario');
    filtroAccion = document.getElementById('filtroAccion');
    filtroTabla = document.getElementById('filtroTabla');
    filtroDesde = document.getElementById('filtroDesde');
    filtroHasta = document.getElementById('filtroHasta');
    filtroRegistro = document.getElementById('filtroRegistro');
    btnExportarCSV = document.getElementById('btnExportarCSV');
    tbodyAuditoria = document.getElementById('tbodyAuditoria');
    btnCargarMas = document.getElementById('btnCargarMas');
    estadoCarga = document.getElementById('estadoCarga');
    sinRegistros = document.getElementById('sinRegistros');
    conteoRegistros = document.getElementById('conteoRegistros');
    badgeTotalRegistros = document.getElementById('badgeTotalRegistros');
    metricaEventos = document.getElementById('metricaEventos');
    metricaAccesosHC = document.getElementById('metricaAccesosHC');
    metricaConfidenciales = document.getElementById('metricaConfidenciales');
    metricaUsuarios = document.getElementById('metricaUsuarios');
    modalDetalleEl = document.getElementById('modalDetalleAuditoria');
    modalContenidoEl = document.getElementById('modalDetalleAuditoriaContenido');

    if (!tbodyAuditoria) return;

    // Fechas por defecto: últimos 7 días
    const hoy = new Date();
    const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (filtroDesde && !filtroDesde.value) {
      filtroDesde.value = aFechaISO(hace7Dias);
    }
    if (filtroHasta && !filtroHasta.value) {
      filtroHasta.value = aFechaISO(hoy);
    }

    // Handlers para filtros inmediatos
    const recargar = () => {
      consultarBitacora(false);
      consultarResumen();
    };

    if (filtroUsuario) filtroUsuario.addEventListener('change', recargar);
    if (filtroAccion) filtroAccion.addEventListener('change', recargar);
    if (filtroTabla) filtroTabla.addEventListener('change', recargar);
    if (filtroDesde) filtroDesde.addEventListener('change', recargar);
    if (filtroHasta) filtroHasta.addEventListener('change', recargar);

    // Debounce para el input de texto de búsqueda por código de registro UUID
    if (filtroRegistro) {
      filtroRegistro.addEventListener('input', window.HIS.debounce(recargar, 350));
    }

    // Paginación Keyset: Cargar más
    if (btnCargarMas) {
      btnCargarMas.addEventListener('click', () => {
        consultarBitacora(true);
      });
    }

    // Botón Exportar CSV
    if (btnExportarCSV) {
      btnExportarCSV.addEventListener('click', exportarCSV);
    }

    // Carga inicial
    consultarBitacora(false);
    consultarResumen();
    sincronizarCatalogoUsuarios();
  }

  // Disparar en DOMContentLoaded o inmediato si ya está cargado
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }
})();
