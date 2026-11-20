// public/js/integraciones.js — Pantalla C.23: Despacho de órdenes a sistemas externos, reintentos y reenvío
(function () {
  'use strict';

  // Estado local de la vista
  let filtroEstadoActual = null;
  let ordenSeleccionadaId = null;
  let despachosEnMemoria = [];
  let resumenEnMemoria = { PENDIENTE: 0, REINTENTO: 0, ERROR: 0, ENVIADO: 0 };

  // Elementos DOM
  const contenedor = document.getElementById('contenedorIntegraciones');
  const esAdmin = (contenedor && contenedor.dataset.esAdmin === 'true') ||
                  (window.__HISCARE_USUARIO__ && window.__HISCARE_USUARIO__.rol === 'ADMINISTRADOR');

  const cntPendientes = document.getElementById('cntPendientes');
  const cntReintentos = document.getElementById('cntReintentos');
  const cntErrores = document.getElementById('cntErrores');
  const cntEnviadas = document.getElementById('cntEnviadas');

  const tablaCuerpo = document.getElementById('tablaIntegracionesCuerpo');
  const spinnerCarga = document.getElementById('spinnerCarga');
  const badgeTotalFilas = document.getElementById('badgeTotalFilas');
  const barraFiltroActivo = document.getElementById('barraFiltroActivo');
  const textoFiltroActivo = document.getElementById('textoFiltroActivo');
  const btnLimpiarFiltro = document.getElementById('btnLimpiarFiltro');
  const btnRefrescar = document.getElementById('btnRefrescar');

  // Panel de detalle
  const detalleCodigoOrden = document.getElementById('detalleCodigoOrden');
  const detalleSistema = document.getElementById('detalleSistema');
  const detalleFechaEnvio = document.getElementById('detalleFechaEnvio');
  const detalleBadgeEstado = document.getElementById('detalleBadgeEstado');
  const detalleAclaracionEstado = document.getElementById('detalleAclaracionEstado');
  const detalleIntentos = document.getElementById('detalleIntentos');
  const detalleIdDespacho = document.getElementById('detalleIdDespacho');
  const detalleRespuesta = document.getElementById('detalleRespuesta');
  const detalleIndicadorSeleccion = document.getElementById('detalleIndicadorSeleccion');
  const btnDetalleImprimir = document.getElementById('btnDetalleImprimir');
  const btnDetalleReenviar = document.getElementById('btnDetalleReenviar');

  // Utilidades
  function escaparHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function mostrarToast(tipo, mensaje) {
    if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
      window.HIS.mostrarMensaje(tipo, mensaje);
      return;
    }
    const contAlertas = document.getElementById('alertas') || document.querySelector('.main-wrapper');
    if (!contAlertas) {
      if (typeof alert === 'function') alert(mensaje);
      return;
    }
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${tipo} alert-dismissible fade show shadow-sm mb-3`;
    alertDiv.setAttribute('role', 'alert');

    const span = document.createElement('span');
    span.textContent = mensaje;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-close';
    btn.setAttribute('data-bs-dismiss', 'alert');
    btn.setAttribute('aria-label', 'Cerrar');

    alertDiv.appendChild(span);
    alertDiv.appendChild(btn);

    contAlertas.prepend(alertDiv);
    setTimeout(() => {
      if (alertDiv.parentNode) {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 150);
      }
    }, 5000);
  }

  function abreviarDespacho(id) {
    if (!id) return '—';
    const s = String(id).replace(/-/g, '');
    if (s.length < 8) return `dsp-${s}`;
    return `dsp-${s.slice(0, 4)}...${s.slice(-2)}`;
  }

  function formatearFecha(f) {
    if (!f) return 'Pendiente de despacho';
    try {
      const d = new Date(f);
      if (isNaN(d.getTime())) return String(f);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) {
      return String(f);
    }
  }

  function formatearRespuesta(resp) {
    if (!resp) return 'Sin respuesta registrada aún.';
    if (typeof resp === 'object') {
      try {
        return JSON.stringify(resp, null, 2);
      } catch (e) {
        return String(resp);
      }
    }
    try {
      const parseado = JSON.parse(resp);
      return JSON.stringify(parseado, null, 2);
    } catch (e) {
      return String(resp);
    }
  }

  function obtenerBadgeClaseYTexto(estado, tieneRespuesta) {
    const st = String(estado || 'PENDIENTE').toUpperCase();
    if (st === 'ENVIADO') {
      return {
        clase: 'bg-success-subtle text-success border border-success-subtle',
        texto: 'ENVIADO',
        aclaracion: ''
      };
    }
    if (st === 'REINTENTO') {
      return {
        clase: 'bg-warning-subtle text-warning-emphasis border border-warning-subtle',
        texto: 'REINTENTO',
        aclaracion: 'Pendiente de reenvío'
      };
    }
    if (st === 'ERROR') {
      return {
        clase: 'bg-danger-subtle text-danger border border-danger-subtle',
        texto: 'ERROR',
        aclaracion: tieneRespuesta ? 'Rechazada' : ''
      };
    }
    return {
      clase: 'bg-primary-subtle text-primary border border-primary-subtle',
      texto: 'PENDIENTE',
      aclaracion: ''
    };
  }

  // Carga del resumen de contadores [23.16–23.24]
  async function cargarResumen() {
    try {
      const res = await fetch('/api/integraciones/resumen', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const r = data.data || data;

      if (r) {
        resumenEnMemoria = {
          PENDIENTE: Number(r.PENDIENTE || 0),
          REINTENTO: Number(r.REINTENTO || 0),
          ERROR: Number(r.ERROR || 0),
          ENVIADO: Number(r.ENVIADO || 0)
        };
        if (cntPendientes) cntPendientes.textContent = resumenEnMemoria.PENDIENTE;
        if (cntReintentos) cntReintentos.textContent = resumenEnMemoria.REINTENTO;
        if (cntErrores) cntErrores.textContent = resumenEnMemoria.ERROR;
        if (cntEnviadas) cntEnviadas.textContent = resumenEnMemoria.ENVIADO;
      }
    } catch (err) {
      console.warn('No fue posible actualizar el resumen de integraciones:', err);
    }
  }

  // Render de filas en la tabla
  function renderTabla(lista) {
    if (!tablaCuerpo) return;

    if (window.HIS && typeof window.HIS.destruirDataTable === 'function') {
      window.HIS.destruirDataTable('#tablaIntegraciones');
    }
    tablaCuerpo.innerHTML = '';

    if (!lista || lista.length === 0) {
      const tr = document.createElement('tr');
      tr.id = 'filaSinDatos';
      tr.innerHTML = `
        <td colspan="7" class="text-center py-5 text-muted">
          <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" class="mb-2 text-secondary opacity-50">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
          <div class="fw-semibold">No se encontraron despachos para el filtro actual</div>
          <small>Pruebe seleccionando otro estado o limpiando el filtro.</small>
        </td>
      `;
      tablaCuerpo.appendChild(tr);
      if (badgeTotalFilas) badgeTotalFilas.textContent = '0';
      return;
    }

    if (badgeTotalFilas) badgeTotalFilas.textContent = String(lista.length);

    lista.forEach((item) => {
      const st = String(item.estado_envio || 'PENDIENTE').toUpperCase();
      const badgeInfo = obtenerBadgeClaseYTexto(st, Boolean(item.respuesta));

      const codOrden = escaparHtml(item.orden_codigo || item.codigo || '—');
      const nomPaciente = escaparHtml(item.paciente || item.paciente_nombre || '—');
      const nomSistema = escaparHtml(item.sistema || item.sistema_destino || 'LIS');
      const uuidDespacho = escaparHtml(item.id_despacho || '');
      const dspAbrev = escaparHtml(abreviarDespacho(item.id_despacho));
      const numIntentos = escaparHtml((typeof item.intentos !== 'undefined') ? item.intentos : 0);
      const itemId = escaparHtml(item.id);
      const ordenId = escaparHtml(item.orden_id || '');
      const esSeleccionado = (ordenSeleccionadaId && (ordenSeleccionadaId === item.id || ordenSeleccionadaId === item.orden_id));

      const tr = document.createElement('tr');
      tr.className = `fila-despacho ${esSeleccionado ? 'table-primary fw-medium' : ''}`;
      tr.dataset.id = item.id;
      tr.dataset.ordenId = item.orden_id || '';
      tr.dataset.estado = st;

      const btnReenviarHtml = (st === 'ERROR' && esAdmin)
        ? `<button type="button" class="btn btn-sm btn-outline-danger btn-accion-reenviar py-0 px-2 ms-1" data-trace="C23-34" data-id="${itemId}" title="Reintentar envío ahora">Reenviar</button>`
        : '';

      tr.innerHTML = `
        <td class="ps-3 fw-bold text-dark font-monospace small">${codOrden}</td>
        <td>
          <div class="fw-medium text-dark text-truncate" style="max-width: 140px;" title="${nomPaciente}">${nomPaciente}</div>
        </td>
        <td>
          <span class="badge bg-secondary-subtle text-dark border">${nomSistema}</span>
        </td>
        <td>
          <code class="small text-muted" data-trace="C23-29" title="${uuidDespacho}">${dspAbrev}</code>
        </td>
        <td>
          <span class="badge ${badgeInfo.clase}" data-trace="C23-32">
            ${badgeInfo.texto}
          </span>
          ${badgeInfo.aclaracion ? `<div class="small text-muted" style="font-size: 0.72rem;">${badgeInfo.aclaracion}</div>` : ''}
        </td>
        <td class="text-center font-monospace small">${numIntentos}</td>
        <td class="pe-3 text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary btn-accion-detalle py-0 px-2" data-trace="C23-33" data-id="${itemId}" title="Ver detalle del despacho">
            Detalle
          </button>
          ${btnReenviarHtml}
        </td>
      `;

      tablaCuerpo.appendChild(tr);
    });

    if (window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
      window.HIS.inicializarDataTable('#tablaIntegraciones');
    }
  }

  // Carga del listado principal desde /api/integraciones
  async function cargarIntegraciones(opciones = {}) {
    if (spinnerCarga) spinnerCarga.style.display = 'inline-flex';
    try {
      const url = new URL('/api/integraciones', window.location.origin);
      if (filtroEstadoActual) {
        url.searchParams.set('estado', filtroEstadoActual);
      }
      if (opciones.orden) {
        url.searchParams.set('orden', opciones.orden);
      }

      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });

      if (!res.ok) {
        throw new Error('Error al consultar /api/integraciones (' + res.status + ')');
      }

      const respJson = await res.json().catch(() => ({}));
      const items = Array.isArray(respJson.data) ? respJson.data : (Array.isArray(respJson) ? respJson : []);
      despachosEnMemoria = items;
      renderTabla(items);

      // Si hay una orden solicitada por URL o estado previo, seleccionarla
      const idParaSeleccionar = opciones.ordenId || opciones.orden || ordenSeleccionadaId;
      if (idParaSeleccionar) {
        const encontrada = items.find(i => i.id === idParaSeleccionar || i.orden_id === idParaSeleccionar || i.orden_codigo === idParaSeleccionar);
        if (encontrada) {
          cargarDetalle(encontrada.id);
        }
      } else if (items.length > 0 && !ordenSeleccionadaId) {
        // Seleccionar la primera por defecto para comodidad
        cargarDetalle(items[0].id);
      }
    } catch (err) {
      console.warn('Aviso al cargar integraciones:', err.message);
    } finally {
      if (spinnerCarga) spinnerCarga.style.display = 'none';
    }
  }

  // Carga del detalle en el panel derecho [23.35]
  async function cargarDetalle(integracionId, opciones = {}) {
    if (!integracionId) return;
    ordenSeleccionadaId = integracionId;

    // Resaltar en la tabla
    document.querySelectorAll('#tablaIntegracionesCuerpo tr.fila-despacho').forEach(tr => {
      if (tr.dataset.id === integracionId || tr.dataset.ordenId === integracionId) {
        tr.classList.add('table-primary');
      } else {
        tr.classList.remove('table-primary');
      }
    });

    if (opciones && opciones.scrollMobile) {
      const panel = document.getElementById('panelDetalle');
      if (typeof window !== 'undefined' && window.innerWidth < 992 && panel && typeof panel.scrollIntoView === 'function') {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    if (detalleIndicadorSeleccion) {
      detalleIndicadorSeleccion.textContent = 'Cargando...';
      detalleIndicadorSeleccion.className = 'badge bg-primary-subtle text-primary border border-primary-subtle small';
    }

    try {
      const res = await fetch(`/api/integraciones/${encodeURIComponent(integracionId)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });

      let item = null;
      if (res.ok) {
        const datos = await res.json().catch(() => ({}));
        item = datos.data || datos;
      } else {
        // Fallback a memoria si la ruta API aún no está disponible
        item = despachosEnMemoria.find(d => d.id === integracionId || d.orden_id === integracionId);
      }

      if (!item) {
        if (detalleIndicadorSeleccion) detalleIndicadorSeleccion.textContent = 'No encontrado';
        return;
      }

      const st = String(item.estado_envio || 'PENDIENTE').toUpperCase();
      const badgeInfo = obtenerBadgeClaseYTexto(st, Boolean(item.respuesta));

      if (detalleCodigoOrden) detalleCodigoOrden.textContent = item.orden_codigo || item.codigo || '—';
      if (detalleSistema) detalleSistema.textContent = item.sistema || item.sistema_destino || 'LIS';
      if (detalleFechaEnvio) detalleFechaEnvio.textContent = formatearFecha(item.fecha_envio);

      if (detalleBadgeEstado) {
        detalleBadgeEstado.className = `badge ${badgeInfo.clase}`;
        detalleBadgeEstado.textContent = badgeInfo.texto;
      }
      if (detalleAclaracionEstado) {
        detalleAclaracionEstado.textContent = badgeInfo.aclaracion ? `(${badgeInfo.aclaracion})` : '';
      }

      if (detalleIntentos) {
        detalleIntentos.textContent = `Intentos: ${(typeof item.intentos !== 'undefined') ? item.intentos : 0}`;
      }
      if (detalleIdDespacho) {
        detalleIdDespacho.textContent = item.id_despacho || '—';
      }

      if (detalleRespuesta) {
        detalleRespuesta.textContent = formatearRespuesta(item.respuesta);
      }

      if (detalleIndicadorSeleccion) {
        detalleIndicadorSeleccion.textContent = 'Activo';
        detalleIndicadorSeleccion.className = 'badge bg-success-subtle text-success border border-success-subtle small';
      }

      // Botón imprimir
      const ordenId = item.orden_id || item.orden || integracionId;
      if (btnDetalleImprimir) {
        if (ordenId) {
          btnDetalleImprimir.href = `/ordenes/${encodeURIComponent(ordenId)}/imprimir`;
          btnDetalleImprimir.classList.remove('disabled');
        } else {
          btnDetalleImprimir.href = '#';
          btnDetalleImprimir.classList.add('disabled');
        }
      }

      // Botón reenviar en el panel de detalle
      if (btnDetalleReenviar) {
        if (st === 'ERROR' && esAdmin) {
          btnDetalleReenviar.classList.remove('d-none');
          btnDetalleReenviar.dataset.id = item.id;
          btnDetalleReenviar.disabled = false;
        } else {
          btnDetalleReenviar.classList.add('d-none');
        }
      }
    } catch (err) {
      console.warn('Error al cargar detalle:', err);
      if (detalleIndicadorSeleccion) detalleIndicadorSeleccion.textContent = 'Error';
    }
  }

  // Reenviar orden (POST /api/integraciones/:id/reenviar)
  async function reenviarOrden(integracionId, botonOrigen) {
    if (!integracionId) return;

    if (!esAdmin) {
      mostrarToast('danger', 'Acción denegada: Solo los administradores pueden reenviar órdenes.');
      return;
    }

    if (botonOrigen) {
      botonOrigen.disabled = true;
      botonOrigen.dataset.originalHtml = botonOrigen.innerHTML;
      botonOrigen.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Enviando...';
    }

    try {
      const res = await fetch(`/api/integraciones/${encodeURIComponent(integracionId)}/reenviar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'same-origin'
      });

      const datos = await res.json().catch(() => ({}));

      if (res.status === 202 || res.status === 200 || datos.ok) {
        mostrarToast('success', 'Orden encolada para reenvío inmediato con id de despacho idempotente.');

        // Actualizar datos sin recargar la página completa
        await cargarResumen();
        await cargarIntegraciones({ ordenId: integracionId });
        await cargarDetalle(integracionId);
      } else {
        const mensajeError = (datos.error && datos.error.mensaje) || 'No fue posible reenviar la orden.';
        mostrarToast('warning', mensajeError);
      }
    } catch (err) {
      mostrarToast('danger', 'Error de conexión al solicitar el reenvío: ' + err.message);
    } finally {
      if (botonOrigen) {
        botonOrigen.disabled = false;
        if (botonOrigen.dataset.originalHtml) {
          botonOrigen.innerHTML = botonOrigen.dataset.originalHtml;
        }
      }
    }
  }

  // Filtrado por tarjetas de estado [23.16–23.24]
  function aplicarFiltroEstado(nuevoFiltro) {
    const cards = document.querySelectorAll('.card-filtro-estado');

    if (filtroEstadoActual === nuevoFiltro) {
      // Toggle: si hace clic en la misma, quitar filtro
      filtroEstadoActual = null;
      cards.forEach(c => c.classList.remove('border-2', 'border-dark', 'shadow'));
      if (barraFiltroActivo) barraFiltroActivo.classList.add('d-none');
    } else {
      filtroEstadoActual = nuevoFiltro;
      cards.forEach(c => {
        if (c.dataset.filtro === nuevoFiltro) {
          c.classList.add('border-2', 'border-dark', 'shadow');
        } else {
          c.classList.remove('border-2', 'border-dark', 'shadow');
        }
      });
      if (barraFiltroActivo && textoFiltroActivo) {
        const nombresFiltro = {
          PENDIENTE: 'Pendientes de envío',
          REINTENTO: 'En reintento (Pendientes de reenvío)',
          ERROR: 'Error / Rechazadas',
          ENVIADO: 'Enviadas y recibidas'
        };
        textoFiltroActivo.textContent = `Filtrando por: ${nombresFiltro[nuevoFiltro] || nuevoFiltro}`;
        barraFiltroActivo.classList.remove('d-none');
        barraFiltroActivo.classList.add('d-flex');
      }
    }

    cargarIntegraciones();
  }

  // Event Listeners e Inicialización
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Manejo de tarjetas de filtro
    document.querySelectorAll('.card-filtro-estado').forEach((card) => {
      card.addEventListener('click', () => {
        const f = card.dataset.filtro;
        aplicarFiltroEstado(f);
      });
    });

    if (btnLimpiarFiltro) {
      btnLimpiarFiltro.addEventListener('click', () => {
        filtroEstadoActual = null;
        document.querySelectorAll('.card-filtro-estado').forEach(c => c.classList.remove('border-2', 'border-dark', 'shadow'));
        if (barraFiltroActivo) barraFiltroActivo.classList.add('d-none');
        cargarIntegraciones();
      });
    }

    if (btnRefrescar) {
      btnRefrescar.addEventListener('click', () => {
        cargarResumen();
        cargarIntegraciones({ ordenId: ordenSeleccionadaId });
      });
    }

    // 2. Delegación de eventos en la tabla para "Detalle" y "Reenviar"
    if (tablaCuerpo) {
      tablaCuerpo.addEventListener('click', (e) => {
        const btnDetalle = e.target.closest('.btn-accion-detalle');
        const btnReenviar = e.target.closest('.btn-accion-reenviar');
        const fila = e.target.closest('tr.fila-despacho');

        if (btnReenviar) {
          e.stopPropagation();
          const id = btnReenviar.dataset.id;
          reenviarOrden(id, btnReenviar);
          return;
        }

        if (btnDetalle) {
          e.stopPropagation();
          const id = btnDetalle.dataset.id;
          cargarDetalle(id, { scrollMobile: true });
          return;
        }

        if (fila && fila.dataset.id) {
          cargarDetalle(fila.dataset.id, { scrollMobile: true });
        }
      });
    }

    // 3. Botón Reenviar en el panel de detalle
    if (btnDetalleReenviar) {
      btnDetalleReenviar.addEventListener('click', () => {
        const id = btnDetalleReenviar.dataset.id || ordenSeleccionadaId;
        reenviarOrden(id, btnDetalleReenviar);
      });
    }

    // 4. Parámetro query `orden` de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const ordenParam = urlParams.get('orden');
    const estadoParam = urlParams.get('estado');

    if (estadoParam) {
      aplicarFiltroEstado(estadoParam.toUpperCase());
    }

    // 5. Carga inicial asíncrona
    cargarResumen();
    cargarIntegraciones({ orden: ordenParam });
  });
})();
