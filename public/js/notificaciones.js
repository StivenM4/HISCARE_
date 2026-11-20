// public/js/notificaciones.js — Centro de notificaciones y alertas clínicas (Pantalla C.11)
(function () {
  'use strict';

  let ultimoConteoNoLeidas = null;

  function anunciar(mensaje, prioridad = 'polite') {
    if (window.HIS && typeof window.HIS.anunciarCambio === 'function') {
      window.HIS.anunciarCambio(mensaje, prioridad);
    }
  }

  /**
   * Escapa caracteres especiales de HTML para prevención de XSS.
   */
  function escaparHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /**
   * Formatea una fecha en tiempo relativo clínico en español.
   * Ejemplos: "Hace 5 min", "Hace 1 h", "Ayer", etc.
   * @param {string|Date|number} fecha - Timestamp o fecha ISO
   * @returns {string} Tiempo relativo formateado
   */
  function formatearTiempoRelativo(fecha) {
    if (!fecha) return 'Reciente';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return 'Reciente';

    const ahora = Date.now();
    const diffSeg = Math.floor((ahora - d.getTime()) / 1000);

    if (diffSeg < 0) return 'Ahora';
    if (diffSeg < 30) return 'Hace un momento';
    if (diffSeg < 60) return `Hace ${diffSeg} s`;

    const diffMin = Math.floor(diffSeg / 60);
    if (diffMin < 60) return `Hace ${diffMin} min`;

    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return diffHoras === 1 ? 'Hace 1 h' : `Hace ${diffHoras} h`;

    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias === 1) return 'Ayer';
    if (diffDias < 7) return `Hace ${diffDias} días`;

    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
  }

  /**
   * Actualiza el badge numérico en la campana de la barra superior.
   * Si es 0 o menor, se oculta (hidden = true).
   * @param {number} conteo - Cantidad de notificaciones no leídas
   */
  function actualizarBadgeCampana(conteo) {
    const badge = document.getElementById('notifCount');
    if (!badge) return;

    const n = Math.max(0, parseInt(conteo, 10) || 0);
    if (n > 0) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = false;
      badge.removeAttribute('hidden');
      badge.classList.remove('d-none');
    } else {
      badge.textContent = '0';
      badge.hidden = true;
      badge.setAttribute('hidden', '');
    }
  }

  /**
   * Obtiene el conteo actual de notificaciones no leídas y actualiza la campana.
   */
  async function cargarConteoNoLeidas() {
    if (document.visibilityState !== 'visible') return;
    try {
      if (!window.HIS || typeof window.HIS.api !== 'function') return;
      const resp = await window.HIS.api('/api/notificaciones/no-leidas/conteo');
      const conteo = resp && resp.conteo !== undefined ? Number(resp.conteo) : (typeof resp === 'number' ? resp : 0);
      const badgePrevio = document.getElementById('notifCount');
      const conteoPrevio = ultimoConteoNoLeidas !== null
        ? ultimoConteoNoLeidas
        : (badgePrevio && !badgePrevio.hidden ? (parseInt(badgePrevio.textContent, 10) || 0) : 0);

      actualizarBadgeCampana(conteo);

      if (conteo > conteoPrevio) {
        const diff = conteo - conteoPrevio;
        anunciar(
          diff === 1
            ? `Tienes 1 notificación nueva sin leer. Total sin leer: ${conteo}.`
            : `Tienes ${diff} notificaciones nuevas sin leer. Total sin leer: ${conteo}.`,
          'polite'
        );
      }
      ultimoConteoNoLeidas = conteo;

      // Si existe contador en los filtros de la vista listado, sincronizarlo
      const badgeListado = document.getElementById('badgeFiltroNoLeidas');
      if (badgeListado) {
        badgeListado.textContent = String(conteo);
      }
    } catch (e) {
      // Ignorar fallas transitorias de red o rutas no listas
    }
  }

  /**
   * Genera el ícono SVG correspondiente al tipo de notificación clínica.
   * @param {string} mensaje - Mensaje de la notificación
   * @returns {string} HTML del ícono SVG
   */
  function obtenerIconoTipo(mensaje) {
    const msg = (mensaje || '').toLowerCase();
    if (msg.includes('laboratorio')) {
      return `
        <span class="badge bg-primary-subtle text-primary p-2 rounded-circle d-inline-flex align-items-center justify-content-center" data-trace="C11-39">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
          </svg>
        </span>
      `;
    }
    if (msg.includes('radiolog')) {
      return `
        <span class="badge bg-warning-subtle text-warning-emphasis p-2 rounded-circle d-inline-flex align-items-center justify-content-center" data-trace="C11-39">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
        </span>
      `;
    }
    return `
      <span class="badge bg-info-subtle text-info-emphasis p-2 rounded-circle d-inline-flex align-items-center justify-content-center" data-trace="C11-39">
        <span data-trace="C11-47">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
          </svg>
        </span>
      </span>
    `;
  }

  /**
   * Renderiza dinámicamente los elementos de notificación en el desplegable de la campana.
   * @param {Array} items - Lista de notificaciones
   */
  function renderizarNotificacionesDropdown(items) {
    const lista = document.getElementById('notificacionesLista');
    const vacio = document.getElementById('notificacionesVacio');
    if (!lista) return;

    if (!items || !items.length) {
      lista.innerHTML = '';
      if (vacio) vacio.classList.remove('d-none');
      return;
    }

    if (vacio) vacio.classList.add('d-none');

    let html = '';
    items.forEach((item) => {
      const esCritica = item.prioridad === 'CRITICA';
      const esLeida = Boolean(item.leido);
      const tiempo = formatearTiempoRelativo(item.fecha);
      const resId = item.resultado_id ? encodeURIComponent(item.resultado_id) : '';
      const notifId = encodeURIComponent(item.id || '');
      const iconoHtml = obtenerIconoTipo(item.mensaje);
      const msgEsc = escaparHtml(item.mensaje);

      html += `
        <div class="list-group-item list-group-item-action p-3 notif-item ${!esLeida ? 'no-leida' : ''} ${esCritica ? 'prioridad-critica' : ''}"
             data-trace="C11-38"
             data-id="${notifId}"
             ${resId ? `data-resultado-id="${resId}"` : ''}
             style="cursor: pointer;">
          <div class="d-flex align-items-start gap-2">
            <div class="notif-icono flex-shrink-0 mt-1">
              ${iconoHtml}
            </div>
            <div class="flex-grow-1 min-w-0" data-trace="C11-40">
              <div class="d-flex align-items-center justify-content-between mb-1">
                ${esCritica
                  ? `<span class="badge bg-danger text-white rounded-pill px-2 py-0 small fw-bold" data-trace="C11-43">Alerta crítica</span>`
                  : `<span class="badge bg-secondary-subtle text-secondary rounded-pill px-2 py-0 small">Aviso clínico</span>`}
                ${!esLeida
                  ? `<span class="notif-dot bg-primary rounded-circle" title="No leída"></span>`
                  : ''}
              </div>
              ${esCritica
                ? `
                  <p class="mb-1 small fw-semibold text-danger text-break notif-texto" data-trace="C11-44" data-trace-c11-42="true">${msgEsc}</p>
                  <div class="small text-muted d-flex align-items-center gap-1" data-trace="C11-45">
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span class="tiempo-relativo" data-trace="C11-41">${tiempo}</span>
                  </div>
                `
                : `
                  <p class="mb-1 small text-dark text-break notif-texto" data-trace="C11-46" data-trace-c11-42="true">${msgEsc}</p>
                  <div class="small text-muted d-flex align-items-center gap-1" data-trace="C11-48">
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span class="tiempo-relativo" data-trace="C11-41">${tiempo}</span>
                  </div>
                `}
            </div>
          </div>
        </div>
      `;
    });

    lista.innerHTML = html;
  }

  /**
   * Carga las notificaciones recientes para el desplegable de la campana.
   */
  async function cargarNotificacionesDropdown() {
    const lista = document.getElementById('notificacionesLista');
    if (!lista) return;

    try {
      if (!window.HIS || typeof window.HIS.api !== 'function') return;
      const resp = await window.HIS.api('/api/notificaciones?limite=8');
      const items = Array.isArray(resp) ? resp : (resp && Array.isArray(resp.notificaciones) ? resp.notificaciones : []);
      renderizarNotificacionesDropdown(items);
      const criticasNoLeidas = items.filter((it) => it && it.prioridad === 'CRITICA' && !it.leido);
      if (criticasNoLeidas.length > 0) {
        anunciar(
          criticasNoLeidas.length === 1
            ? `Alerta crítica sin leer: ${criticasNoLeidas[0].mensaje || 'revise el panel de notificaciones.'}`
            : `Atención: tienes ${criticasNoLeidas.length} alertas críticas sin leer.`,
          'assertive'
        );
      }
    } catch (e) {
      // Si falla la consulta, no romper el dropdown
    }
  }

  /**
   * Marca una notificación individual como leída vía PATCH /api/notificaciones/:id/leida.
   * @param {string} id - UUID de la notificación
   * @param {HTMLElement} [elemento] - Elemento DOM contenedor a actualizar
   */
  async function marcarNotificacionLeida(id, elemento) {
    if (!id) return;
    try {
      if (!window.HIS || typeof window.HIS.api !== 'function') return;
      await window.HIS.api(`/api/notificaciones/${encodeURIComponent(id)}/leida`, {
        method: 'PATCH'
      });

      // Actualización visual inmediata en el DOM
      const elementos = document.querySelectorAll(`[data-id="${id}"]`);
      elementos.forEach((el) => {
        el.classList.remove('no-leida');
        const dot = el.querySelector('.notif-dot');
        if (dot) dot.remove();

        const badgeNoLeida = el.querySelector('.notif-badge-estado');
        if (badgeNoLeida) {
          badgeNoLeida.className = 'badge bg-light text-muted border rounded-pill px-2 py-1 small';
          badgeNoLeida.textContent = 'Leída';
        }

        const btnMarcar = el.querySelector('.btn-marcar-leida');
        if (btnMarcar) btnMarcar.remove();
      });

      // Decrementar conteo badge de forma inmediata
      const badge = document.getElementById('notifCount');
      if (badge && !badge.hidden) {
        const actual = parseInt(badge.textContent, 10) || 0;
        const nuevo = Math.max(0, actual - 1);
        actualizarBadgeCampana(nuevo);
        ultimoConteoNoLeidas = nuevo;

        const badgeListado = document.getElementById('badgeFiltroNoLeidas');
        if (badgeListado) {
          badgeListado.textContent = String(nuevo);
        }
      }

      anunciar('Notificación marcada como leída.', 'polite');
    } catch (err) {
      // Silencioso o notificar
    }
  }

  /**
   * Marca todas las notificaciones del usuario como leídas vía PATCH /api/notificaciones/leidas.
   */
  async function marcarTodasLeidas() {
    try {
      if (!window.HIS || typeof window.HIS.api !== 'function') return;
      await window.HIS.api('/api/notificaciones/leidas', {
        method: 'PATCH'
      });

      // Resetear contador de la campana inmediatamente
      actualizarBadgeCampana(0);
      ultimoConteoNoLeidas = 0;

      // Limpiar estados no leídos en dropdown y vista completa
      document.querySelectorAll('.notif-item.no-leida').forEach((el) => {
        el.classList.remove('no-leida');
      });

      document.querySelectorAll('.notif-dot').forEach((el) => el.remove());

      document.querySelectorAll('.notif-badge-estado').forEach((el) => {
        el.className = 'badge bg-light text-muted border rounded-pill px-2 py-1 small';
        el.textContent = 'Leída';
      });

      document.querySelectorAll('.btn-marcar-leida').forEach((btn) => btn.remove());

      const badgeListado = document.getElementById('badgeFiltroNoLeidas');
      if (badgeListado) {
        badgeListado.textContent = '0';
      }

      if (typeof window.HIS.mostrarMensaje === 'function') {
        window.HIS.mostrarMensaje('success', 'Todas las notificaciones han sido marcadas como leídas.');
      }
    } catch (err) {
      if (typeof window.HIS.mostrarMensaje === 'function') {
        window.HIS.mostrarMensaje('danger', 'No se pudieron marcar todas las notificaciones como leídas.');
      }
    }
  }

  /**
   * Manejador de clic en una notificación: si tiene resultado_id, marca como leída y navega.
   */
  async function manejarClicNotificacion(e) {
    // Si se hizo clic en un botón interno específico (ej. botón marcar leída), dejar que su manejador actúe
    if (e.target.closest('.btn-marcar-leida')) return;

    const item = e.target.closest('.notif-item');
    if (!item) return;

    const notifId = item.dataset.id;
    const resultadoId = item.dataset.resultadoId;

    // Si tiene resultado_id, navegar al visor de resultados C.25
    if (resultadoId) {
      e.preventDefault();
      // Si aún no estaba leída, marcarla inmediatamente
      if (item.classList.contains('no-leida') && notifId) {
        marcarNotificacionLeida(notifId, item);
      }
      location.href = `/resultados/${encodeURIComponent(resultadoId)}`;
    } else if (item.classList.contains('no-leida') && notifId) {
      // Si no tiene resultado pero no estaba leída, marcar como leída
      marcarNotificacionLeida(notifId, item);
    }
  }

  /**
   * Actualiza periódicamente los textos de tiempo relativo presentes en el DOM.
   */
  function actualizarTiemposRelativosEnDOM() {
    document.querySelectorAll('[data-fecha-notif]').forEach((el) => {
      const fecha = el.dataset.fechaNotif;
      if (fecha) {
        el.textContent = formatearTiempoRelativo(fecha);
      }
    });
  }

  // Inicialización cuando el DOM está completamente cargado
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar conteo inicial de no leídas
    cargarConteoNoLeidas();

    // 2. Formatear tiempos relativos iniciales en la vista
    actualizarTiemposRelativosEnDOM();

    // 3. Dropdown de notificaciones: cargar al abrir
    const contenedorNotif = document.getElementById('contenedorNotificaciones');
    const dropdownMenu = document.getElementById('dropdownNotificaciones');
    if (contenedorNotif && dropdownMenu) {
      contenedorNotif.addEventListener('show.bs.dropdown', () => {
        cargarNotificacionesDropdown();
      });
    }

    // 4. Delegación de eventos para clics en elementos de notificación
    document.addEventListener('click', (e) => {
      // Botón "Marcar todas como leídas" en dropdown o vista
      if (e.target.closest('#btnMarcarTodasLeidasDropdown') || e.target.closest('#btnMarcarTodasLeidasVista')) {
        e.preventDefault();
        marcarTodasLeidas();
        return;
      }

      // Botón individual "Marcar leída"
      const btnLeida = e.target.closest('.btn-marcar-leida');
      if (btnLeida) {
        e.preventDefault();
        e.stopPropagation();
        const id = btnLeida.dataset.id;
        const fila = btnLeida.closest('.notif-item');
        marcarNotificacionLeida(id, fila);
        return;
      }

      // Enlace a resultado con clase .notif-link-resultado
      const linkResultado = e.target.closest('.notif-link-resultado');
      if (linkResultado) {
        const id = linkResultado.dataset.id;
        if (id) {
          marcarNotificacionLeida(id);
        }
        return;
      }

      // Clic general en una tarjeta/elemento de notificación
      const notifItem = e.target.closest('.notif-item');
      if (notifItem) {
        manejarClicNotificacion(e);
      }
    });

    // 5. Polling cada 30 segundos respetando document.visibilityState === 'visible'
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        cargarConteoNoLeidas();
        actualizarTiemposRelativosEnDOM();
      }
    }, 30000);

    // 6. Al regresar a la pestaña activa, actualizar inmediatamente
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        cargarConteoNoLeidas();
        actualizarTiemposRelativosEnDOM();
      }
    });
  });

  // Exposición en el espacio de nombres global HIS
  window.HIS = window.HIS || {};
  window.HIS.notificaciones = {
    formatearTiempoRelativo,
    actualizarBadgeCampana,
    cargarConteoNoLeidas,
    cargarNotificacionesDropdown,
    marcarNotificacionLeida,
    marcarTodasLeidas,
    obtenerIconoTipo
  };
})();
