// public/js/agenda_diaria.js — C.18: Gestión de agenda médica diaria, sala de espera e inicio de atención
(function () {
  'use strict';

  const { api, mostrarMensaje } = (typeof window !== 'undefined' && window.HIS) ? window.HIS : {
    api: async (url, opts) => {
      const res = await fetch(url, {
        method: opts?.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
        body: opts?.body ? JSON.stringify(opts.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error?.mensaje || 'Error en la solicitud');
        err.status = res.status;
        err.error = data.error;
        throw err;
      }
      return data;
    },
    mostrarMensaje: (tipo, msg) => {
      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
        return window.HIS.mostrarMensaje(tipo, msg);
      }
      if (typeof alert === 'function') alert(msg);
    },
  };

  const tablaAgenda = document.getElementById('tablaAgenda');
  const cuerpoSalaEspera = document.getElementById('cuerpoSalaEspera');
  const badgeSalaCount = document.getElementById('badgeSalaCount');
  const selectMedico = document.getElementById('selectMedico');
  const inputFecha = document.getElementById('inputFecha');

  const rolUsuario = (tablaAgenda && tablaAgenda.dataset && tablaAgenda.dataset.rol) || '';
  const puedeEscribirAttr = (tablaAgenda && tablaAgenda.dataset) ? tablaAgenda.dataset.puedeEscribir : undefined;
  const puedeEscribir = puedeEscribirAttr === undefined ? true : puedeEscribirAttr === 'true';
  const esMedico = rolUsuario === 'MEDICO';
  const puedeIniciarAtencion = esMedico || rolUsuario === 'ADMINISTRADOR';

  const modalEl = document.getElementById('modalNoAsistio');
  let bsModal = null;
  if (modalEl && typeof bootstrap !== 'undefined' && bootstrap && bootstrap.Modal) {
    bsModal = new bootstrap.Modal(modalEl);
  }

  const modalCitaId = document.getElementById('modalCitaId');
  const modalPacienteNombre = document.getElementById('modalPacienteNombre');
  const btnConfirmarNoAsistio = document.getElementById('btnConfirmarNoAsistio');

  let ultimoConteoSala = null;
  if (badgeSalaCount && badgeSalaCount.textContent) {
    const m = String(badgeSalaCount.textContent).match(/\d+/);
    if (m) ultimoConteoSala = Number(m[0]);
  }

  function escaparHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatearFechaVisual(fechaIso) {
    if (!fechaIso || typeof fechaIso !== 'string') return '';
    const fParts = fechaIso.split('-');
    if (fParts.length !== 3) return fechaIso;
    const diasSem = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dt = new Date(Number(fParts[0]), Number(fParts[1]) - 1, Number(fParts[2]));
    const diaStr = diasSem[dt.getDay()] || 'Lun';
    return diaStr + ' ' + fParts[2] + '/' + fParts[1] + '/' + fParts[0];
  }

  function renderBadgeEstadoAgenda(estado) {
    if (estado === 'PROGRAMADA') {
      return '<span class="badge rounded-pill bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1" data-trace="C18-30">PROGRAMADA</span>';
    }
    if (estado === 'CONFIRMADA') {
      return '<span class="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-2 py-1" data-trace="C18-30">CONFIRMADA</span>';
    }
    if (estado === 'EN_SALA') {
      return '<span class="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1" data-trace="C18-30">En sala de espera</span>';
    }
    if (estado === 'ATENDIDA') {
      return '<span class="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-2 py-1" data-trace="C18-32">ATENDIDA</span>';
    }
    if (estado === 'CANCELADA') {
      return '<span class="badge rounded-pill bg-danger-subtle text-danger border border-danger-subtle px-2 py-1" data-trace="C18-30">CANCELADA</span>';
    }
    if (estado === 'NO_ASISTIO') {
      return '<span class="badge rounded-pill bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle px-2 py-1" data-trace="C18-30">No asistió</span>';
    }
    return '<span class="badge rounded-pill bg-light text-secondary border px-2 py-1" data-trace="C18-30">' + escaparHtml(estado || '') + '</span>';
  }

  function renderAccionesCita(c) {
    const idEsc = escaparHtml(c.id);
    const idUrl = encodeURIComponent(c.id == null ? '' : String(c.id));
    const pacEsc = escaparHtml(c.paciente || '');
    const disabledAttr = puedeEscribir ? '' : ' disabled';
    let html = '<div class="d-inline-flex align-items-center gap-1 justify-content-end">';

    if (c.estado === 'PROGRAMADA') {
      html += '<button type="button" data-accion="estado" data-loading-text="Confirmando..." class="btn btn-sm btn-outline-primary btn-accion-estado" data-id="' + idEsc + '" data-estado="CONFIRMADA"' + disabledAttr + '>Confirmar</button>';
      html += '<div class="dropdown">';
      html += '<button class="btn btn-sm btn-light text-muted border-0 py-1 px-2" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Más opciones" aria-label="Más opciones"' + disabledAttr + '>&#8942;</button>';
      html += '<ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">';
      html += '<li><a class="dropdown-item small" href="/citas/' + idUrl + '">Reprogramar</a></li>';
      html += '<li><a class="dropdown-item small text-danger" href="/citas/' + idUrl + '?accion=cancelar">Cancelar cita</a></li>';
      html += '<li><button class="dropdown-item small text-secondary btn-abrir-no-asistio" type="button" data-id="' + idEsc + '" data-paciente="' + pacEsc + '" data-accion="abrir-no-asistio">No asistió</button></li>';
      html += '</ul></div>';
    } else if (c.estado === 'CONFIRMADA') {
      html += '<button type="button" data-accion="estado" data-loading-text="Registrando llegada..." class="btn btn-sm btn-outline-primary btn-accion-estado" data-id="' + idEsc + '" data-estado="EN_SALA"' + disabledAttr + '>Registrar llegada</button>';
      html += '<div class="dropdown">';
      html += '<button class="btn btn-sm btn-light text-muted border-0 py-1 px-2" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Más opciones" aria-label="Más opciones"' + disabledAttr + '>&#8942;</button>';
      html += '<ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">';
      html += '<li><a class="dropdown-item small" href="/citas/' + idUrl + '">Reprogramar</a></li>';
      html += '<li><a class="dropdown-item small text-danger" href="/citas/' + idUrl + '?accion=cancelar">Cancelar cita</a></li>';
      html += '<li><button class="dropdown-item small text-secondary btn-abrir-no-asistio" type="button" data-id="' + idEsc + '" data-paciente="' + pacEsc + '" data-accion="abrir-no-asistio">No asistió</button></li>';
      html += '</ul></div>';
    } else if (c.estado === 'EN_SALA') {
      if (puedeIniciarAtencion) {
        html += '<button type="button" class="btn btn-sm btn-primary fw-semibold btn-iniciar-atencion" data-id="' + idEsc + '" data-cita-id="' + idEsc + '" data-accion="iniciar" data-loading-text="Iniciando...">Iniciar atención</button>';
      } else {
        html += '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle py-1 px-2 rounded-pill">Esperando médico</span>';
      }
      html += '<div class="dropdown">';
      html += '<button class="btn btn-sm btn-light text-muted border-0 py-1 px-2" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Más opciones" aria-label="Más opciones"' + disabledAttr + '>&#8942;</button>';
      html += '<ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">';
      html += '<li><a class="dropdown-item small text-danger" href="/citas/' + idUrl + '?accion=cancelar">Cancelar cita</a></li>';
      html += '<li><button class="dropdown-item small text-secondary btn-abrir-no-asistio" type="button" data-id="' + idEsc + '" data-paciente="' + pacEsc + '" data-accion="abrir-no-asistio">No asistió</button></li>';
      html += '</ul></div>';
    } else if (c.estado === 'ATENDIDA') {
      if (c.atencion_id) {
        html += '<a class="btn btn-sm btn-outline-secondary" href="/atenciones/' + encodeURIComponent(String(c.atencion_id)) + '/consulta" data-trace="C18-33">Ver atención</a>';
      } else {
        html += '<span class="text-muted small">Atendida</span>';
      }
    } else {
      html += '<span class="text-muted small">—</span>';
    }

    html += '</div>';
    return html;
  }

  function renderizarTablaAgenda(filas, citaResaltadaId) {
    const cuerpoTabla = document.getElementById('cuerpoTablaAgenda');
    if (!cuerpoTabla) return;

    const renderFn = () => {
      if (!Array.isArray(filas) || !filas.length) {
        cuerpoTabla.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted"><div class="text-muted mb-1" style="font-size: 1.5rem;">📋</div><div class="fw-medium">No hay citas programadas</div><div class="small text-muted">No se encontraron turnos para este profesional en la fecha seleccionada.</div></td></tr>';
        return;
      }

      let html = '';
      filas.forEach((c) => {
        const idEsc = escaparHtml(c.id);
        const pacEsc = escaparHtml(c.paciente || '');
        const horaEsc = escaparHtml(c.hora || '--:--');
        const rowClass = (citaResaltadaId && String(c.id) === String(citaResaltadaId)) ? ' class="his-row-updated"' : '';
        html += '<tr data-cita="' + idEsc + '" data-paciente="' + pacEsc + '"' + rowClass + '>';
        html += '<td class="cell-time"><span class="agenda-hora-pill">' + horaEsc + '</span></td>';
        html += '<td><span class="fw-semibold text-dark">' + pacEsc + '</span></td>';
        html += '<td>' + renderBadgeEstadoAgenda(c.estado) + '</td>';
        html += '<td class="text-end cell-actions" data-trace="C18-31">' + renderAccionesCita(c) + '</td>';
        html += '</tr>';
      });
      cuerpoTabla.innerHTML = html;
    };

    if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.refrescarDataTable === 'function') {
      window.HIS.refrescarDataTable('#tablaAgenda', renderFn);
    } else {
      renderFn();
    }
  }

  function renderizarSalaEspera(pacientes) {
    if (!cuerpoSalaEspera) return;
    const lista = Array.isArray(pacientes) ? pacientes : [];
    ultimoConteoSala = lista.length;

    if (badgeSalaCount) {
      badgeSalaCount.textContent = lista.length + ' en espera';
    }

    const renderFn = () => {
      if (!lista.length) {
        cuerpoSalaEspera.innerHTML = '<tr id="filaSinSala"><td colspan="3" class="text-center py-5 text-muted small"><div class="text-muted mb-1" style="font-size: 1.4rem;">☕</div><div class="fw-medium">No hay pacientes en espera</div><div class="text-muted" style="font-size: 0.75rem;">Los pacientes que registren llegada aparecerán aquí automáticamente.</div></td></tr>';
        return;
      }

      let html = '';
      lista.forEach((p) => {
        const mEsp = p.minutos_espera != null ? Number(p.minutos_espera) : 0;
        const badgeClass = mEsp > 30 ? 'badge-espera-urgente' : (mEsp >= 15 ? 'badge-espera-moderada' : 'badge-espera-normal');
        const citaId = escaparHtml(p.cita_id || p.id);
        const horaLlegada = escaparHtml(p.hora_llegada || p.hora_llegada_formato || '--:--');
        const pacienteNombre = escaparHtml(p.paciente || '');
        html += '<tr data-cita="' + citaId + '">';
        html += '<td class="text-muted small cell-time">' + horaLlegada + '</td>';
        html += '<td class="fw-semibold text-dark small">' + pacienteNombre + '</td>';
        html += '<td class="text-end small"><span class="badge ' + badgeClass + ' rounded-pill px-2 py-1">' + mEsp + ' min</span></td>';
        html += '</tr>';
      });
      cuerpoSalaEspera.innerHTML = html;
    };

    if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.refrescarDataTable === 'function') {
      window.HIS.refrescarDataTable('#tablaSalaEspera', renderFn);
    } else {
      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.destruirDataTable === 'function') {
        window.HIS.destruirDataTable('#tablaSalaEspera');
      }
      renderFn();
      if (lista.length && typeof window !== 'undefined' && window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
        window.HIS.inicializarDataTable('#tablaSalaEspera');
      }
    }
  }

  async function recargarAgendaDinamica(opciones = {}) {
    const cuerpoTabla = document.getElementById('cuerpoTablaAgenda');
    if (!cuerpoTabla) {
      if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
        window.location.reload();
      } else if (typeof location !== 'undefined' && typeof location.reload === 'function') {
        location.reload();
      }
      return false;
    }

    const medicoId = opciones.medicoId !== undefined ? opciones.medicoId : (selectMedico ? selectMedico.value : '');
    const fecha = opciones.fecha !== undefined ? opciones.fecha : (inputFecha ? inputFecha.value : '');

    try {
      const params = new URLSearchParams();
      if (medicoId) params.set('medico', medicoId);
      if (fecha) params.set('fecha', fecha);
      const url = '/api/agenda/diaria' + (params.toString() ? '?' + params.toString() : '');
      const resp = await api(url, { method: 'GET' });
      const datos = (resp && resp.data !== undefined && resp.filas === undefined && resp.citas === undefined) ? resp.data : (resp || {});

      const filas = Array.isArray(datos.filas)
        ? datos.filas
        : (Array.isArray(datos.citas) ? datos.citas : []);

      const inds = datos.indicadores || {};
      const total = inds.total != null ? inds.total : (inds.citas_del_dia != null ? inds.citas_del_dia : filas.length);
      const enSala = inds.en_sala != null ? inds.en_sala : filas.filter(c => c.estado === 'EN_SALA').length;
      const atendidas = inds.atendidas != null ? inds.atendidas : filas.filter(c => c.estado === 'ATENDIDA').length;
      const canceladas = inds.canceladas_no_asistio != null
        ? inds.canceladas_no_asistio
        : filas.filter(c => c.estado === 'CANCELADA' || c.estado === 'NO_ASISTIO').length;

      const kpiTotal = document.getElementById('kpiTotal');
      const kpiEnSala = document.getElementById('kpiEnSala');
      const kpiAtendidas = document.getElementById('kpiAtendidas');
      const kpiCanceladas = document.getElementById('kpiCanceladas');
      const badgeCitasCount = document.querySelector('.agenda-badge-count');

      if (kpiTotal) kpiTotal.textContent = String(total);
      if (kpiEnSala) kpiEnSala.textContent = String(enSala);
      if (kpiAtendidas) kpiAtendidas.textContent = String(atendidas);
      if (kpiCanceladas) kpiCanceladas.textContent = String(canceladas);
      if (badgeCitasCount) badgeCitasCount.textContent = filas.length + ' citas registradas';

      if (inputFecha && inputFecha.parentElement) {
        const fechaVisualEl = inputFecha.parentElement.querySelector('.input-group-text');
        if (fechaVisualEl && fecha) {
          fechaVisualEl.textContent = formatearFechaVisual(fecha);
        }
      }

      renderizarTablaAgenda(filas, opciones.citaResaltadaId);

      let sala = Array.isArray(datos.salaEspera)
        ? datos.salaEspera
        : (Array.isArray(datos.sala_espera) ? datos.sala_espera : null);
      if (!sala) {
        sala = filas
          .filter(c => c.estado === 'EN_SALA')
          .map(c => ({
            cita_id: c.id,
            paciente: c.paciente,
            hora_llegada: c.hora_llegada || c.hora_llegada_formato || c.hora || '--:--',
            minutos_espera: c.minutos_espera != null ? c.minutos_espera : 0,
          }));
      }
      renderizarSalaEspera(sala);

      if (opciones.mensajeAnuncio && typeof window !== 'undefined') {
        window.HIS?.anunciarCambio?.(opciones.mensajeAnuncio);
      }
      if (opciones.mensajeToast) {
        mostrarMensaje('success', opciones.mensajeToast);
      }
      return true;
    } catch (err) {
      mostrarMensaje('danger', (err && err.message) || 'No se pudo actualizar la agenda médica.');
      return false;
    }
  }

  if (tablaAgenda) {
    tablaAgenda.addEventListener('click', async (e) => {
      // Búsqueda selectiva individual para compatibilidad con mocks de test
      const btnIniciar = e.target.closest('.btn-iniciar-atencion');
      const btnEstado = e.target.closest('.btn-accion-estado');
      const btnNoAsistio = e.target.closest('.btn-abrir-no-asistio');
      const btn = btnIniciar || btnEstado || btnNoAsistio || e.target.closest('[data-accion]');

      if (!btn) return;

      const fila = (btn.closest && btn.closest('tr')) ? btn.closest('tr') : null;
      const citaId = btn.dataset.id || (btn.dataset && btn.dataset.cita) || (fila && fila.dataset ? fila.dataset.cita : null);
      const pacienteNombre = btn.dataset.paciente || (fila && fila.dataset ? fila.dataset.paciente : '');
      if (!citaId) return;

      if (btnIniciar || btn.dataset.accion === 'iniciar') {
        btn.disabled = true;
        const textoOriginal = btn.innerHTML;
        const loadingText = btn.dataset.loadingText || 'Iniciando...';
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>' + loadingText;

        try {
          const resp = await api('/api/citas/' + encodeURIComponent(citaId) + '/atencion', {
            method: 'POST',
          });

          const atencionId = (resp && resp.data && resp.data.atencion_id)
            ? resp.data.atencion_id
            : (resp && resp.atencion_id ? resp.atencion_id : null);

          if (atencionId) {
            window.location.href = '/atenciones/' + encodeURIComponent(atencionId) + '/consulta';
          } else {
            await recargarAgendaDinamica({
              citaResaltadaId: citaId,
              mensajeAnuncio: 'Atención clínica iniciada.',
            });
          }
        } catch (err) {
          btn.innerHTML = textoOriginal;
          btn.disabled = false;
          mostrarMensaje('danger', err.message || 'No se pudo iniciar la atención');
        }
      } else if (btnEstado || btn.dataset.accion === 'estado') {
        const nuevoEstado = btn.dataset.estado;
        btn.disabled = true;
        const textoOriginal = btn.innerHTML;
        const loadingText = btn.dataset.loadingText || (nuevoEstado === 'CONFIRMADA' ? 'Confirmando...' : 'Registrando llegada...');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>' + loadingText;
        try {
          await api('/api/citas/' + encodeURIComponent(citaId) + '/estado', {
            method: 'PATCH',
            body: { estado: nuevoEstado },
          });
          const esEnSala = nuevoEstado === 'EN_SALA';
          const mensajeToast = esEnSala
            ? 'Llegada del paciente registrada en sala de espera.'
            : 'Cita confirmada correctamente.';
          const mensajeAnuncio = esEnSala
            ? 'Paciente registrado en sala de espera y tablas actualizadas.'
            : 'Cita confirmada y tabla de agenda actualizada.';
          const ok = await recargarAgendaDinamica({
            citaResaltadaId: citaId,
            mensajeAnuncio,
            mensajeToast,
          });
          if (!ok) {
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
          }
        } catch (err) {
          btn.innerHTML = textoOriginal;
          mostrarMensaje('danger', err.message || 'Error al actualizar el estado de la cita');
          btn.disabled = false;
        }
      } else if (btnNoAsistio || btn.dataset.accion === 'abrir-no-asistio') {
        if (modalCitaId) modalCitaId.value = citaId;
        if (modalPacienteNombre) modalPacienteNombre.textContent = pacienteNombre || 'Paciente seleccionado';
        if (bsModal) {
          bsModal.show();
        } else if (modalEl) {
          modalEl.classList.add('show');
          modalEl.style.display = 'block';
        }
      }
    });
  }

  if (btnConfirmarNoAsistio) {
    btnConfirmarNoAsistio.addEventListener('click', async () => {
      const citaId = modalCitaId ? modalCitaId.value : null;
      if (!citaId) return;

      btnConfirmarNoAsistio.disabled = true;
      btnConfirmarNoAsistio.textContent = 'Procesando...';

      try {
        await api('/api/citas/' + encodeURIComponent(citaId) + '/estado', {
          method: 'PATCH',
          body: { estado: 'NO_ASISTIO' },
        });

        if (bsModal) {
          bsModal.hide();
        } else if (modalEl) {
          if (modalEl.style) modalEl.style.display = 'none';
        }
        btnConfirmarNoAsistio.disabled = false;
        btnConfirmarNoAsistio.textContent = 'Confirmar No asistió';

        await recargarAgendaDinamica({
          citaResaltadaId: citaId,
          mensajeAnuncio: 'Cita marcada como No asistió y agenda actualizada.',
          mensajeToast: 'Cita marcada como No asistió.',
        });
      } catch (err) {
        mostrarMensaje('danger', err.message || 'Error al registrar la inasistencia');
        btnConfirmarNoAsistio.disabled = false;
        btnConfirmarNoAsistio.textContent = 'Confirmar No asistió';
      }
    });
  }

  const formFiltros = document.querySelector('form[action="/agenda"]');
  if (formFiltros) {
    formFiltros.addEventListener('submit', async (e) => {
      e.preventDefault();
      const medicoVal = selectMedico ? selectMedico.value : '';
      const fechaVal = inputFecha ? inputFecha.value : '';
      const ok = await recargarAgendaDinamica({
        medicoId: medicoVal,
        fecha: fechaVal,
        mensajeAnuncio: 'Agenda médica actualizada según los filtros seleccionados.',
      });
      if (ok && typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
        const params = new URLSearchParams();
        if (medicoVal) params.set('medico', medicoVal);
        if (fechaVal) params.set('fecha', fechaVal);
        const qs = params.toString();
        window.history.replaceState(null, '', '/agenda' + (qs ? '?' + qs : ''));
      }
    });
  }

  async function actualizarSalaEspera() {
    const medicoId = selectMedico ? selectMedico.value : null;
    const fecha = inputFecha ? inputFecha.value : '';
    if (!medicoId || !cuerpoSalaEspera) return;

    try {
      const url = '/api/agenda/' + encodeURIComponent(medicoId) + '/sala' + (fecha ? '?fecha=' + encodeURIComponent(fecha) : '');
      const resp = await api(url, { method: 'GET' });
      const pacientes = (resp && Array.isArray(resp.data))
        ? resp.data
        : (Array.isArray(resp) ? resp : []);

      const cantidadPrevia = ultimoConteoSala;
      renderizarSalaEspera(pacientes);
      if (
        typeof window !== 'undefined' &&
        ((cantidadPrevia !== null && pacientes.length !== cantidadPrevia) ||
          (cantidadPrevia === null && pacientes.length > 0))
      ) {
        const msg = pacientes.length === 1
          ? 'Sala de espera actualizada: 1 paciente en espera.'
          : 'Sala de espera actualizada: ' + pacientes.length + ' pacientes en espera.';
        window.HIS?.anunciarCambio?.(msg);
      }
    } catch (_) {}
  }

  if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
    if (tablaAgenda) window.HIS.inicializarDataTable(tablaAgenda);
    const tablaSala = document.getElementById('tablaSalaEspera');
    if (tablaSala) window.HIS.inicializarDataTable(tablaSala);
  }

  if (cuerpoSalaEspera && selectMedico) {
    setInterval(actualizarSalaEspera, 60000);
  }

  if (typeof window !== 'undefined') {
    window.HISCARE_AGENDA = {
      recargarAgendaDinamica,
      actualizarSalaEspera,
    };
  }
})();
