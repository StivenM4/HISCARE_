/**
 * public/js/timeline.js — Lógica de cliente para la Pantalla C.9 · Historia clínica longitudinal
 * Vanilla ES6 sin dependencias externas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('timelineApp');
  if (!root) return;

  const escapeHtml = (typeof window !== 'undefined' && (window.HIS?.escapeHtml || window.HISCARE?.escapeHtml)) || function (str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const historiaId = root.dataset.historiaId;
  const pacienteId = root.dataset.pacienteId;
  let eventoId = root.dataset.eventoId || new URLSearchParams(window.location.search).get('evento') || '';
  let periodoActual = root.dataset.periodo || new URLSearchParams(window.location.search).get('periodo') || 'todo';

  // Elementos de la interfaz
  const timelineSpinner = document.getElementById('timelineSpinner');
  const timelineEmpty = document.getElementById('timelineEmpty');
  const timelineError = document.getElementById('timelineError');
  const timelineErrorMensaje = document.getElementById('timelineErrorMensaje');
  const btnReintentarTimeline = document.getElementById('btnReintentarTimeline');
  const timelineLista = document.getElementById('timelineLista');
  const timelineContador = document.getElementById('timelineContador');

  // Filtros de periodo
  const btnFiltro1a = document.getElementById('btnFiltro1a');
  const btnFiltro5a = document.getElementById('btnFiltro5a');
  const btnFiltroTodo = document.getElementById('btnFiltroTodo');
  const botonesFiltro = [btnFiltro1a, btnFiltro5a, btnFiltroTodo].filter(Boolean);

  // Panel lateral derecho
  const panelPlaceholder = document.getElementById('panelPlaceholder');
  const panelSpinner = document.getElementById('panelSpinner');
  const panelContenido = document.getElementById('panelContenido');

  // Elementos del detalle
  const panelAtencionCodigoBadge = document.getElementById('panelAtencionCodigoBadge');
  const panelAtencionEstadoBadge = document.getElementById('panelAtencionEstadoBadge');
  const panelAtencionFecha = document.getElementById('panelAtencionFecha');
  const panelAtencionMotivo = document.getElementById('panelAtencionMotivo');
  const panelMedicoAvatar = document.getElementById('panelMedicoAvatar');
  const panelMedicoNombre = document.getElementById('panelMedicoNombre');
  const panelMedicoEspecialidad = document.getElementById('panelMedicoEspecialidad');
  const panelMedicoEmail = document.getElementById('panelMedicoEmail');
  const panelDiagPrincipalCodigo = document.getElementById('panelDiagPrincipalCodigo');
  const panelDiagPrincipalDesc = document.getElementById('panelDiagPrincipalDesc');
  const panelDiagSecundarios = document.getElementById('panelDiagSecundarios');
  const panelProcedimientosLista = document.getElementById('panelProcedimientosLista');
  const panelOrdenesLista = document.getElementById('panelOrdenesLista');
  const panelResultadosLista = document.getElementById('panelResultadosLista');
  const btnVerConsultaCompleta = document.getElementById('btnVerConsultaCompleta');

  // Estado local
  let hitosActuales = [];

  /**
   * Formatea fecha ISO a español DD/MM/YYYY y HH:MM
   */
  function formatearFecha(isoString) {
    if (!isoString) return { fecha: '--/--/----', hora: '--:--', textoCompleto: '--/--/----' };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return { fecha: String(isoString).slice(0, 10), hora: '', textoCompleto: String(isoString) };
    }
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return {
      fecha: `${dia}/${mes}/${anio}`,
      hora: `${hora}:${min}`,
      textoCompleto: `${dia}/${mes}/${anio} ${hora}:${min}`,
    };
  }

  /**
   * Genera iniciales del médico
   */
  function obtenerIniciales(nombre) {
    if (!nombre) return 'MD';
    const partes = nombre.trim().replace(/^(Dr\.|Dra\.|Lic\.|Enf\.)\s*/i, '').split(/\s+/);
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  /**
   * Alterna clases activas de los botones de filtro
   */
  function actualizarBotonesFiltro(periodo) {
    periodoActual = periodo;
    botonesFiltro.forEach((btn) => {
      const p = btn.dataset.periodo;
      if (p === periodo) {
        btn.classList.remove('btn-outline-primary');
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
      }
    });

    const url = new URL(window.location.href);
    url.searchParams.set('periodo', periodo);
    if (eventoId) {
      url.searchParams.set('evento', eventoId);
    }
    window.history.replaceState({}, '', url.toString());
  }

  /**
   * Obtiene la lista de hitos desde el backend
   */
  async function cargarTimeline(periodo = 'todo', autoSeleccionarId = null) {
    timelineSpinner.classList.remove('d-none');
    timelineEmpty.classList.add('d-none');
    timelineError.classList.add('d-none');
    timelineLista.innerHTML = '';
    timelineContador.textContent = 'Cargando...';

    try {
      const res = await fetch(`/api/historias/${encodeURIComponent(historiaId)}/timeline?periodo=${encodeURIComponent(periodo)}`, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Error ${res.status}: No se pudo cargar la línea de tiempo`);
      }

      const json = await res.json();
      if (!json.ok) {
        throw new Error((json.error && json.error.mensaje) || 'Error al obtener datos');
      }

      hitosActuales = Array.isArray(json.data) ? json.data : [];
      timelineSpinner.classList.add('d-none');

      if (hitosActuales.length === 0) {
        timelineEmpty.classList.remove('d-none');
        timelineContador.textContent = '0 eventos';
        mostrarPlaceholderPanel('No hay eventos clínicos registrados para el período seleccionado.');
        return;
      }

      timelineContador.textContent = `${hitosActuales.length} evento${hitosActuales.length === 1 ? '' : 's'}`;
      renderizarHitos(hitosActuales);

      // Selección automática: si viene en URL/dataset o primer hito
      const targetId = autoSeleccionarId || eventoId;
      let hitoTarget = null;

      if (targetId) {
        hitoTarget = hitosActuales.find((h) => h.id === targetId || h.atencion_id === targetId);
      }

      if (!hitoTarget && hitosActuales.length > 0) {
        hitoTarget = hitosActuales[0];
      }

      if (hitoTarget) {
        seleccionarHito(hitoTarget);
      }
    } catch (err) {
      timelineSpinner.classList.add('d-none');
      timelineError.classList.remove('d-none');
      timelineErrorMensaje.textContent = err.message || 'Error al comunicarse con el servidor.';
      timelineContador.textContent = 'Error';
    }
  }

  /**
   * Renderiza los hitos en el contenedor de la columna izquierda
   */
  function renderizarHitos(hitos) {
    timelineLista.innerHTML = '';

    hitos.forEach((hito, index) => {
      const { fecha, hora } = formatearFecha(hito.fecha);
      const tipo = (hito.tipo || '').toUpperCase();

      let colorIcono = '#0d6efd';
      let iconoSvg = '';
      let badgeTituloHtml = '';
      let subtituloHtml = '';

      if (tipo === 'ATENCION') {
        colorIcono = '#0d6efd';
        iconoSvg = `
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/>
            <path d="M8 6.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V11a.5.5 0 0 1-1 0V9.5H6a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z"/>
          </svg>`;
        const codAtencion = hito.atencion_id ? 'ATE-' + hito.atencion_id.slice(0, 8).toUpperCase() : 'ATE';
        badgeTituloHtml = `<span class="badge bg-primary text-white px-2 py-1 fw-bold">Consulta médica · ${escapeHtml(codAtencion)}</span>`;
        const badgeEstadoClase = hito.estado === 'CERRADA' ? 'bg-secondary' : 'bg-success';
        subtituloHtml = `
          <div class="mt-1" data-trace="C9-30">
            <div class="fw-semibold text-dark">${escapeHtml(hito.titulo || 'Atención médica')}</div>
            <div class="text-secondary small text-truncate">${escapeHtml(hito.subtitulo || 'Consulta médica')}</div>
            <div class="d-flex align-items-center gap-2 mt-1">
              <span class="badge ${badgeEstadoClase} rounded-pill" style="font-size: 0.7rem;">${escapeHtml(hito.estado || 'ABIERTA')}</span>
            </div>
          </div>`;
      } else if (tipo === 'ORDEN') {
        colorIcono = 'var(--hiscare-violet-solid, #6d28d9)';
        iconoSvg = `
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5v-13zM2 2v12h12V2H2z"/>
            <path d="M4 4.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5z"/>
          </svg>`;
        const codOrden = hito.titulo ? hito.titulo.split('·')[0].trim() : 'ORD';
        badgeTituloHtml = `<span class="badge px-2 py-1 fw-bold" style="background-color: var(--hiscare-violet-solid, #6d28d9); color: var(--hiscare-violet-on-solid, #ffffff);" data-trace="C9-32">Orden de laboratorio · ${escapeHtml(codOrden)}</span>`;
        const badgeEstadoClase = hito.estado === 'COMPLETADA' ? 'bg-success' : 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
        subtituloHtml = `
          <div class="mt-1" data-trace="C9-33">
            <div class="text-secondary small fw-medium">${escapeHtml(hito.subtitulo || 'Procedimientos solicitados')}</div>
            <div class="d-flex align-items-center gap-2 mt-1">
              <span class="badge ${badgeEstadoClase} rounded-pill" style="font-size: 0.7rem;">${escapeHtml(hito.estado || 'PENDIENTE')}</span>
            </div>
          </div>`;
      } else if (tipo === 'RESULTADO') {
        colorIcono = '#d63384';
        iconoSvg = `
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9.5 0a.5.5 0 0 1 .5.5.5.5 0 0 0 .5.5.5.5 0 0 1 .5.5V2a.5.5 0 0 1-.5.5h-1A.5.5 0 0 1 9 2v-.5a.5.5 0 0 1 .5-.5.5.5 0 0 0 .5-.5.5.5 0 0 1-.5-.5zM6 2.5A.5.5 0 0 1 6.5 2h3a.5.5 0 0 1 .5.5V3h-4v-.5z"/>
            <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4.5zM3.5 4a.5.5 0 0 0-.5.5v9.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5a.5.5 0 0 0-.5-.5h-9z"/>
            <path d="M10.854 7.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 9.793l2.646-2.647a.5.5 0 0 1 .708 0z"/>
          </svg>`;
        const codRes = hito.titulo || 'Resultado';
        badgeTituloHtml = `<span class="badge px-2 py-1 fw-bold" style="background-color: #d63384; color: white;" data-trace="C9-26">Resultado de laboratorio · ${escapeHtml(codRes)}</span>`;
        subtituloHtml = `
          <div class="mt-1" data-trace="C9-27">
            <div class="text-secondary small fst-italic text-truncate">${escapeHtml(hito.subtitulo || 'Informe disponible')}</div>
          </div>`;
      }

      const itemRow = document.createElement('div');
      itemRow.className = 'timeline-row-item d-flex gap-3 mb-3';
      itemRow.dataset.id = hito.id;
      itemRow.dataset.atencionId = hito.atencion_id || '';
      itemRow.dataset.tipo = tipo;

      itemRow.innerHTML = `
        <div class="timeline-date-col text-end pt-2" style="min-width: 82px;" data-trace="C9-28">
          <div class="fw-bold text-dark font-monospace" style="font-size: 0.85rem;">${escapeHtml(fecha)}</div>
          <div class="text-muted small">${escapeHtml(hora || '')}</div>
        </div>

        <div class="timeline-axis d-flex flex-column align-items-center position-relative">
          <div class="timeline-node rounded-circle d-flex align-items-center justify-content-center shadow-sm flex-shrink-0"
               style="width: 38px; height: 38px; background-color: #ffffff; border: 2px solid ${colorIcono}; color: ${colorIcono}; z-index: 2;">
            ${iconoSvg}
          </div>
          ${index < hitos.length - 1 ? '<div class="timeline-line flex-grow-1" style="width: 2px; background-color: #e2e8f0; margin-top: 4px; margin-bottom: 4px;"></div>' : ''}
        </div>

        <div class="timeline-card-wrapper flex-grow-1 pb-1">
          <div class="timeline-card card shadow-sm border bg-white p-3 rounded-3"
               data-trace="C9-29"
               style="cursor: pointer; transition: all 0.18s ease-in-out;">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1">
              ${badgeTituloHtml}
            </div>
            ${subtituloHtml}
          </div>
        </div>
      `;

      itemRow.addEventListener('click', () => {
        seleccionarHito(hito);
      });

      timelineLista.appendChild(itemRow);
    });
  }

  /**
   * Resalta el hito activo en el DOM y carga su resumen
   */
  function seleccionarHito(hito) {
    if (!hito) return;

    const todasLasFilas = timelineLista.querySelectorAll('.timeline-row-item');
    todasLasFilas.forEach((f) => {
      const card = f.querySelector('.timeline-card');
      if (card) {
        card.classList.remove('timeline-item-selected');
        card.style.border = '';
        card.style.borderColor = '';
        card.style.backgroundColor = '';
        card.style.boxShadow = '';
      }
    });

    const filaActiva = timelineLista.querySelector(`[data-id="${hito.id}"]`);
    if (filaActiva) {
      const cardActiva = filaActiva.querySelector('.timeline-card');
      if (cardActiva) {
        cardActiva.classList.add('timeline-item-selected');
      }
      filaActiva.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    eventoId = hito.id;
    const url = new URL(window.location.href);
    url.searchParams.set('evento', hito.id);
    window.history.replaceState({}, '', url.toString());

    if (hito.atencion_id) {
      cargarResumenAtencion(hito.atencion_id);
    } else {
      mostrarPlaceholderPanel('El evento seleccionado no tiene una atención clínica vinculada.');
    }
  }

  /**
   * Carga el resumen clínico vía /api/atenciones/:id/resumen
   */
  async function cargarResumenAtencion(atencionId) {
    if (!atencionId) return;

    panelPlaceholder.classList.add('d-none');
    panelSpinner.classList.remove('d-none');
    panelContenido.classList.add('d-none');

    try {
      const res = await fetch(`/api/atenciones/${encodeURIComponent(atencionId)}/resumen`, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Error ${res.status}: No se pudo cargar el resumen de la atención`);
      }

      const json = await res.json();
      if (!json.ok || !json.data) {
        throw new Error((json.error && json.error.mensaje) || 'Resumen no disponible');
      }

      renderizarDetalle(json.data);
      panelSpinner.classList.add('d-none');
      panelContenido.classList.remove('d-none');
    } catch (err) {
      panelSpinner.classList.add('d-none');
      mostrarPlaceholderPanel(`No se pudo cargar el detalle: ${err.message}`);
    }
  }

  /**
   * Puebla el panel derecho con los datos de la atención
   */
  function renderizarDetalle(data) {
    const { atencion, medico, diagnosticos, procedimientos, ordenes, resultados } = data;

    // Encabezado
    if (atencion) {
      const codAtencion = atencion.id ? 'ATE-' + atencion.id.slice(0, 8).toUpperCase() : 'ATE-0000';
      panelAtencionCodigoBadge.textContent = codAtencion;
      panelAtencionEstadoBadge.textContent = atencion.estado || 'ABIERTA';
      panelAtencionEstadoBadge.className = `badge ${atencion.estado === 'CERRADA' ? 'bg-secondary' : 'bg-success'}`;
      panelAtencionFecha.textContent = atencion.fecha_formateada || atencion.fecha || '--/--/----';
      panelAtencionMotivo.textContent = atencion.motivo_consulta || 'Sin motivo de consulta registrado.';

      btnVerConsultaCompleta.href = `/atenciones/${encodeURIComponent(atencion.id)}/consulta`;
    }

    // Médico tratante [C9-41 a C9-43]
    if (medico) {
      panelMedicoNombre.textContent = medico.nombre || 'Médico no especificado';
      panelMedicoEspecialidad.textContent = medico.especialidad || 'Medicina general';
      panelMedicoEmail.textContent = medico.email || '';
      panelMedicoAvatar.textContent = obtenerIniciales(medico.nombre);
    } else {
      panelMedicoNombre.textContent = 'No asignado';
      panelMedicoEspecialidad.textContent = '';
      panelMedicoEmail.textContent = '';
      panelMedicoAvatar.textContent = 'MD';
    }

    // Diagnósticos (CIE-10) [C9-44 a C9-47]
    const diagList = Array.isArray(diagnosticos) ? diagnosticos : [];
    const diagPrincipal = diagList.find((d) => (d.tipo || '').toUpperCase() === 'PRINCIPAL') || diagList[0];
    const diagSecundarios = diagList.filter((d) => d !== diagPrincipal);

    if (diagPrincipal) {
      panelDiagPrincipalCodigo.textContent = diagPrincipal.codigo || 'CIE-10';
      panelDiagPrincipalDesc.textContent = diagPrincipal.descripcion || 'Sin descripción';
    } else {
      panelDiagPrincipalCodigo.textContent = '--';
      panelDiagPrincipalDesc.textContent = 'Sin diagnóstico principal registrado';
    }

    panelDiagSecundarios.innerHTML = '';
    if (diagSecundarios.length > 0) {
      diagSecundarios.forEach((d) => {
        const item = document.createElement('div');
        item.className = 'd-flex align-items-start gap-2 p-1 rounded bg-light border';
        item.innerHTML = `
          <span class="badge bg-secondary text-white font-monospace" style="font-size: 0.72rem;">${escapeHtml(d.codigo || '')}</span>
          <span class="text-secondary small fw-medium text-truncate">${escapeHtml(d.descripcion || '')}</span>
        `;
        panelDiagSecundarios.appendChild(item);
      });
    } else {
      panelDiagSecundarios.innerHTML = '<span class="text-muted small fst-italic">Sin diagnósticos secundarios</span>';
    }

    // Procedimientos (CUPS) [C9-48 a C9-51]
    const procList = Array.isArray(procedimientos) ? procedimientos : [];
    panelProcedimientosLista.innerHTML = '';
    if (procList.length > 0) {
      procList.forEach((p) => {
        const item = document.createElement('div');
        item.className = 'p-2 rounded bg-light border d-flex flex-column gap-1';
        item.dataset.trace = 'C9-51';
        item.innerHTML = `
          <div class="d-flex align-items-center justify-content-between">
            <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle font-monospace fw-bold" style="font-size: 0.75rem;">${escapeHtml(p.codigo || '')}</span>
            <small class="text-muted">${escapeHtml(p.fecha_formateada || '')}</small>
          </div>
          <span class="text-dark small fw-medium">${escapeHtml(p.descripcion || '')}</span>
          ${p.requiere_consentimiento ? '<span class="badge bg-warning bg-opacity-25 text-warning-emphasis border border-warning-subtle align-self-start" style="font-size: 0.65rem;">Requiere consentimiento</span>' : ''}
        `;
        panelProcedimientosLista.appendChild(item);
      });
    } else {
      panelProcedimientosLista.innerHTML = '<span class="text-muted small fst-italic">Sin procedimientos realizados en esta atención</span>';
    }

    // Órdenes vinculadas
    const ordList = Array.isArray(ordenes) ? ordenes : [];
    panelOrdenesLista.innerHTML = '';
    if (ordList.length > 0) {
      ordList.forEach((ord) => {
        const item = document.createElement('div');
        item.className = 'p-2 rounded bg-light border d-flex flex-column gap-1';
        const estadoBadge = ord.estado === 'COMPLETADA' ? 'bg-success' : 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
        item.innerHTML = `
          <div class="d-flex align-items-center justify-content-between">
            <span class="font-monospace fw-bold small text-primary">${escapeHtml(ord.codigo || '')}</span>
            <span class="badge ${estadoBadge} rounded-pill" style="font-size: 0.68rem;">${escapeHtml(ord.estado || '')}</span>
          </div>
          <div class="text-secondary small">${escapeHtml(ord.tipo || '')} · ${escapeHtml(ord.fecha_formateada || '')}</div>
          <div class="d-flex justify-content-end mt-1">
            <a href="/ordenes/${encodeURIComponent(ord.id)}/imprimir"
               target="_blank"
               class="btn btn-xs btn-outline-secondary d-inline-flex align-items-center gap-1 py-0 px-2"
               style="font-size: 0.72rem;">
              <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"/></svg>
              <span>Imprimir orden</span>
            </a>
          </div>
        `;
        panelOrdenesLista.appendChild(item);
      });
    } else {
      panelOrdenesLista.innerHTML = '<span class="text-muted small fst-italic">No se emitieron órdenes en esta atención</span>';
    }

    // Resultados vinculados
    const resList = Array.isArray(resultados) ? resultados : [];
    panelResultadosLista.innerHTML = '';
    if (resList.length > 0) {
      resList.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'p-2 rounded bg-light border d-flex flex-column gap-1';
        const informeTexto = r.informe ? r.informe.slice(0, 140) + (r.informe.length > 140 ? '...' : '') : 'Sin observaciones';
        item.innerHTML = `
          <div class="d-flex align-items-center justify-content-between">
            <span class="badge bg-secondary-subtle text-dark font-monospace" style="font-size: 0.72rem;">${escapeHtml(r.orden_codigo || r.tipo || '')}</span>
            <small class="text-muted">${escapeHtml(r.fecha_resultado_formateada || '')}</small>
          </div>
          <div class="text-dark small">${escapeHtml(informeTexto)}</div>
          ${r.usuario_carga_nombre ? `<small class="text-muted" style="font-size: 0.7rem;">Cargado por: ${escapeHtml(r.usuario_carga_nombre)}</small>` : ''}
          <div class="d-flex justify-content-end mt-1">
            <a href="/resultados/${encodeURIComponent(r.id)}"
               class="btn btn-xs btn-outline-primary d-inline-flex align-items-center gap-1 py-0 px-2"
               style="font-size: 0.72rem;">
              <span>Ver informe completo</span>
            </a>
          </div>
        `;
        panelResultadosLista.appendChild(item);
      });
    } else {
      panelResultadosLista.innerHTML = '<span class="text-muted small fst-italic">Sin resultados diagnósticos registrados</span>';
    }
  }

  /**
   * Muestra el placeholder informativo
   */
  function mostrarPlaceholderPanel(mensaje = '') {
    panelPlaceholder.classList.remove('d-none');
    panelSpinner.classList.add('d-none');
    panelContenido.classList.add('d-none');
    if (mensaje) {
      const p = panelPlaceholder.querySelector('p');
      if (p) p.textContent = mensaje;
    }
  }

  // Bindings
  if (btnFiltro1a) {
    btnFiltro1a.addEventListener('click', () => {
      actualizarBotonesFiltro('1a');
      cargarTimeline('1a');
    });
  }

  if (btnFiltro5a) {
    btnFiltro5a.addEventListener('click', () => {
      actualizarBotonesFiltro('5a');
      cargarTimeline('5a');
    });
  }

  if (btnFiltroTodo) {
    btnFiltroTodo.addEventListener('click', () => {
      actualizarBotonesFiltro('todo');
      cargarTimeline('todo');
    });
  }

  if (btnReintentarTimeline) {
    btnReintentarTimeline.addEventListener('click', () => {
      cargarTimeline(periodoActual, eventoId);
    });
  }

  // Carga inicial
  cargarTimeline(periodoActual, eventoId);
});
