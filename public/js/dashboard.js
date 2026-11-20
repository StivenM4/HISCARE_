// public/js/dashboard.js — comportamiento dinámico del Dashboard de Inicio (C.2)
document.addEventListener('DOMContentLoaded', () => {
  const contenedorDashboard = document.getElementById('dashboardInicio');
  const tbodyCitas = document.getElementById('tbodyCitasDashboard') || document.getElementById('citasBody');
  const badgeTotal = document.getElementById('badgeTotalCitas');
  const inputFechaDashboard = document.getElementById('inputFechaDashboard');
  const formFiltroDashboard = document.getElementById('formFiltroFechaDashboard');

  // KPI elements
  const elCitasHoy = document.getElementById('kpiCitasHoy');
  const elEnSala = document.getElementById('kpiEnSala');
  const elOrdenesPendientes = document.getElementById('kpiOrdenesPendientes');
  const elAlertas = document.getElementById('kpiAlertas');

  let fechaHoy = (inputFechaDashboard && inputFechaDashboard.value) ||
                 (contenedorDashboard && contenedorDashboard.dataset.fechaHoy) ||
                 new Date().toISOString().slice(0, 10);

  function claseBadgeEstado(estado) {
    switch (estado) {
      case 'PROGRAMADA': return 'badge-estado-programada';
      case 'CONFIRMADA': return 'badge-estado-confirmada';
      case 'EN_SALA': return 'badge-estado-en-sala';
      case 'ATENDIDA': return 'badge-estado-atendida';
      case 'CANCELADA': return 'badge-estado-cancelada';
      case 'NO_ASISTIO': return 'badge-estado-no-asistio';
      default: return 'bg-secondary';
    }
  }

  function formatearEstado(estado) {
    if (window.HIS && typeof window.HIS.formatearEstadoCita === 'function') {
      return window.HIS.formatearEstadoCita(estado || 'PROGRAMADA');
    }
    if (estado === 'EN_SALA') return 'En sala de espera';
    if (estado === 'NO_ASISTIO') return 'No asistió';
    return estado || 'PROGRAMADA';
  }

  let ultimoTotalCitas = tbodyCitas && !tbodyCitas.querySelector('#filaSinCitas')
    ? tbodyCitas.querySelectorAll('tr.fila-cita').length
    : null;

  function escaparHtml(str) {
    if (window.HIS && typeof window.HIS.escaparHtml === 'function') {
      return window.HIS.escaparHtml(str);
    }
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Navegación al hacer clic en una fila de la tabla de citas
  function configurarEventosFilas() {
    if (!tbodyCitas) return;
    const filas = tbodyCitas.querySelectorAll('tr.fila-cita, tr[data-cita]');
    filas.forEach((fila) => {
      fila.onclick = function (e) {
        // Evitar redirección si el usuario hizo clic en un botón o enlace interno
        if (e.target.closest('button, a, input, select')) return;
        const fecha = fila.dataset.fecha || fechaHoy;
        const medicoId = fila.dataset.medicoId || '';
        const url = medicoId
          ? `/agenda?fecha=${encodeURIComponent(fecha)}&medico=${encodeURIComponent(medicoId)}`
          : `/agenda?fecha=${encodeURIComponent(fecha)}`;
        window.location.href = url;
      };
    });
  }

  // Carga asíncrona de métricas de la jornada
  async function actualizarMetricas() {
    if (document.visibilityState !== 'visible') return;
    try {
      const data = await window.HIS.api(`/api/metricas/dashboard?fecha=${encodeURIComponent(fechaHoy)}`);
      if (!data) return;
      if (elCitasHoy && data.citasHoy !== undefined) elCitasHoy.textContent = data.citasHoy;
      if (elEnSala && data.enSala !== undefined) elEnSala.textContent = data.enSala;
      if (elOrdenesPendientes && data.ordenesPendientes !== undefined) elOrdenesPendientes.textContent = data.ordenesPendientes;
      if (elAlertas && data.alertas !== undefined) elAlertas.textContent = data.alertas;
    } catch (err) {
      // Si el endpoint aún no está listo o responde error temporal, mantener valores actuales
    }
  }

  // Carga asíncrona de las citas del día
  async function actualizarCitas(anunciar = false) {
    if (document.visibilityState !== 'visible' || !tbodyCitas) return;
    try {
      const lista = await window.HIS.api(`/api/agenda?fecha=${encodeURIComponent(fechaHoy)}`);
      if (!Array.isArray(lista)) return;

      const cambioCantidad = ultimoTotalCitas !== null && lista.length !== ultimoTotalCitas;
      ultimoTotalCitas = lista.length;
      const debeAnunciar = Boolean(anunciar || cambioCantidad);

      if (badgeTotal) {
        badgeTotal.textContent = `${lista.length} citas`;
      }

      const fechaEscapada = escaparHtml(fechaHoy);
      const renderizarTabla = () => {
        if (lista.length === 0) {
          tbodyCitas.innerHTML = `
            <tr id="filaSinCitas">
              <td colspan="4" class="text-center py-5 text-muted">
                No hay citas programadas para la jornada de hoy.
              </td>
            </tr>
          `;
          return;
        }

        let html = '';
        lista.forEach((c) => {
          const hora = escaparHtml(c.hora || '');
          const paciente = escaparHtml(c.paciente || '');
          const profesional = escaparHtml(c.medico || c.profesional || 'Asignado');
          const estadoRaw = c.estado || 'PROGRAMADA';
          const estadoClaseCss = escaparHtml(estadoRaw);
          const estadoTexto = escaparHtml(formatearEstado(estadoRaw));
          const badgeClase = claseBadgeEstado(c.estado);
          const citaId = escaparHtml(c.cita_id || c.id || '');
          const medicoId = escaparHtml(c.medico_id || '');

          html += `
            <tr class="fila-cita clickable-row"
                data-cita-id="${citaId}"
                data-medico-id="${medicoId}"
                data-fecha="${fechaEscapada}"
                style="cursor: pointer;">
              <td class="py-3 px-4 fw-medium text-nowrap">${hora}</td>
              <td class="py-3 px-4 fw-semibold text-dark">${paciente}</td>
              <td class="py-3 px-4 text-muted">${profesional}</td>
              <td class="py-3 px-4">
                <span class="badge rounded-pill estado-${estadoClaseCss} ${badgeClase}" data-trace="C2-30">${estadoTexto}</span>
              </td>
            </tr>
          `;
        });

        tbodyCitas.innerHTML = html;
        configurarEventosFilas();
      };

      if (window.HIS && typeof window.HIS.refrescarDataTable === 'function') {
        window.HIS.refrescarDataTable('#tablaCitasDashboard', renderizarTabla);
      } else {
        renderizarTabla();
      }

      if (debeAnunciar && window.HIS && typeof window.HIS.anunciarCambio === 'function') {
        const etiquetaCitas = lista.length === 0
          ? '0 citas programadas'
          : (lista.length === 1 ? '1 cita programada' : `${lista.length} citas programadas`);
        window.HIS.anunciarCambio(`Agenda del día actualizada: ${etiquetaCitas}.`, 'polite');
      }
    } catch (err) {
      // Mantener citas actuales en caso de error
      if (anunciar && window.HIS && typeof window.HIS.anunciarCambio === 'function') {
        window.HIS.anunciarCambio('No se pudieron actualizar las citas de la jornada.', 'assertive');
      }
    }
  }

  // Inicializar listeners en filas ya renderizadas en servidor
  configurarEventosFilas();

  // Si la tabla no tiene citas o las métricas están en cero, intentar carga inicial
  if (tbodyCitas && tbodyCitas.querySelector('#filaSinCitas')) {
    actualizarCitas();
  }
  actualizarMetricas();

  // Manejadores para el filtro dinámico de fecha
  function cambiarFechaJornada(nuevaFecha) {
    if (!nuevaFecha || nuevaFecha === fechaHoy) return;
    fechaHoy = nuevaFecha;
    if (contenedorDashboard) contenedorDashboard.dataset.fechaHoy = fechaHoy;
    const tituloJornada = document.getElementById('tituloJornada');
    if (tituloJornada) {
      const partes = nuevaFecha.split('-');
      if (partes.length === 3) {
        tituloJornada.textContent = `Inicio · Jornada del ${partes[2]}/${partes[1]}/${partes[0]}`;
      }
    }
    actualizarMetricas();
    actualizarCitas(true);
  }

  if (inputFechaDashboard) {
    inputFechaDashboard.addEventListener('change', () => {
      cambiarFechaJornada(inputFechaDashboard.value);
    });
  }

  if (formFiltroDashboard) {
    formFiltroDashboard.addEventListener('submit', (e) => {
      e.preventDefault();
      if (inputFechaDashboard) {
        cambiarFechaJornada(inputFechaDashboard.value);
      }
    });
  }

  // Refresco periódico cada 60 segundos
  setInterval(() => {
    actualizarMetricas();
    actualizarCitas();
  }, 60000);
});
