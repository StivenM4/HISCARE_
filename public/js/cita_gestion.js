// public/js/cita_gestion.js — Gestión, Cancelación y Reprogramación de citas (Pantalla C.17)
(function () {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});

  // Integración con utilidades globales de HISCARE
  const { api, mostrarMensaje } = globalScope.HIS || {
    api: async (url, opts = {}) => {
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error?.mensaje || 'Error en la petición');
        err.status = res.status;
        err.datos = data.error || {};
        throw err;
      }
      return data.data !== undefined ? data.data : data;
    },
    mostrarMensaje: (tipo, texto) => {
      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
        return window.HIS.mostrarMensaje(tipo, texto);
      }
      if (typeof alert === 'function') alert(texto);
    },
  };

  const escapeHtml = globalScope.HIS?.escapeHtml || globalScope.HIS?.escaparHtml || ((str) => {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  });

  const $ = (id) => document.getElementById(id);

  // Elementos principales del DOM
  const contenedor = $('gestionCitaContenedor');
  if (!contenedor) return;

  const citaId = contenedor.dataset.citaId;
  const pacienteId = contenedor.dataset.pacienteId;
  const medicoIdOriginal = contenedor.dataset.medicoId;
  const estadoOriginal = contenedor.dataset.estado;
  const codigoVisible = contenedor.dataset.codigoVisible || 'CIT-001';
  const fechaOriginalTexto = contenedor.dataset.fechaOriginal || '';
  const puedeModificar = contenedor.dataset.puedeModificar === 'true';

  // Toggle de modo Acción [17.26 y 17.27]
  const btnToggleReprogramar = $('btnToggleReprogramar');
  const btnToggleCancelar = $('btnToggleCancelar');

  // Textarea y contador de motivo [17.28, 17.29]
  const motivoCambio = $('motivoCambio');
  const motivoContador = $('motivoContador');
  const motivoErrorFeedback = $('motivoErrorFeedback');

  // Historial de cambios [17.30 - 17.34]
  const historialBody = $('historialBody');

  // Panel derecho: Controles de Reprogramación [17.35 - 17.40]
  const encabezadoPanelDerecho = $('encabezadoPanelDerecho');
  const badgeModoActivo = $('badgeModoActivo');
  const seccionReprogramacion = $('seccionReprogramacion');
  const selectProfesional = $('selectProfesional');
  const inputFecha = $('inputFecha');
  const contenedorGrillaFranjas = $('contenedorGrillaFranjas');

  // Alerta de conflicto y alternativas [Cruce horario 409]
  const alertaConflicto = $('alertaConflicto');
  const alertaConflictoTexto = $('alertaConflictoTexto');
  const alternativasContenedor = $('alternativasContenedor');

  // Tabla comparativa [17.41 - 17.44]
  const comparativaFechaOriginal = $('comparativaFechaOriginal');
  const comparativaFechaNueva = $('comparativaFechaNueva');
  const comparativaEstadoOriginal = $('comparativaEstadoOriginal');
  const comparativaEstadoNueva = $('comparativaEstadoNueva');
  const comparativaRefOriginal = $('comparativaRefOriginal');
  const comparativaRefNueva = $('comparativaRefNueva');

  // Sección de confirmación de Cancelación
  const seccionCancelacion = $('seccionCancelacion');

  // Alerta informativa y Botones de acción [17.45 - 17.47]
  const alertaInformativa = $('alertaInformativa');
  const alertaInformativaIcono = $('alertaInformativaIcono');
  const alertaInformativaTexto = $('alertaInformativaTexto');
  const btnVolver = $('btnVolver');
  const btnConfirmarAccion = $('btnConfirmarAccion');

  // Estado interno de la pantalla
  let modoActivo = 'reprogramar'; // 'reprogramar' | 'cancelar'
  let franjaSeleccionada = null; // { inicio, fin, duracion_cita }
  let franjasActuales = [];

  /**
   * Extrae la hora formateada HH:MM a partir de un string de fecha/hora.
   * @param {string} str 
   * @returns {string}
   */
  function extraerHora(str) {
    if (!str) return '';
    if (str.includes('T')) return str.split('T')[1].slice(0, 5);
    if (str.includes(' ')) return str.split(' ')[1].slice(0, 5);
    return str.slice(0, 5);
  }

  /**
   * Formatea una fecha YYYY-MM-DD a formato DD/MM/YYYY.
   * @param {string} fechaStr 
   * @returns {string}
   */
  function formatearFechaDDMMAAAA(fechaStr) {
    if (!fechaStr) return '';
    const partes = fechaStr.split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fechaStr;
  }

  /**
   * Calcula la hora final estimada sumando la duración en minutos.
   * @param {string} inicioStr 
   * @param {number} duracionMin 
   * @returns {string}
   */
  function calcularHoraFin(inicioStr, duracionMin = 30) {
    const hora = extraerHora(inicioStr);
    const [h, m] = hora.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    const d = new Date();
    d.setHours(h, m + duracionMin, 0, 0);
    const finH = String(d.getHours()).padStart(2, '0');
    const finM = String(d.getMinutes()).padStart(2, '0');
    return `${finH}:${finM}`;
  }

  /**
   * Valida la longitud y contenido del motivo ingresado.
   * Requisito: obligatorio, entre 5 y 200 caracteres.
   * @returns {boolean}
   */
  function validarMotivo() {
    if (!puedeModificar) return false;
    const texto = motivoCambio?.value ? motivoCambio.value.trim() : '';
    const longitud = texto.length;

    if (motivoContador) {
      motivoContador.textContent = `${longitud} / 200`;
    }

    const esValido = longitud >= 5 && longitud <= 200;

    if (motivoCambio) {
      if (longitud === 0) {
        motivoCambio.classList.remove('is-valid', 'is-invalid');
      } else if (esValido) {
        motivoCambio.classList.remove('is-invalid');
        motivoCambio.classList.add('is-valid');
      } else {
        motivoCambio.classList.remove('is-valid');
        motivoCambio.classList.add('is-invalid');
      }
    }

    return esValido;
  }

  /**
   * Evalúa y actualiza reactivamente el estado habilitado/deshabilitado y estilo del botón de confirmación [17.47].
   */
  function actualizarBotonConfirmar() {
    if (!btnConfirmarAccion) return;

    if (!puedeModificar) {
      btnConfirmarAccion.disabled = true;
      return;
    }

    const motivoValido = validarMotivo();

    if (modoActivo === 'reprogramar') {
      btnConfirmarAccion.textContent = 'Confirmar reprogramación';
      btnConfirmarAccion.className = 'btn btn-primary px-4 fw-semibold';
      const puedeConfirmar = motivoValido && franjaSeleccionada !== null;
      btnConfirmarAccion.disabled = !puedeConfirmar;
    } else {
      btnConfirmarAccion.textContent = 'Confirmar cancelación';
      btnConfirmarAccion.className = 'btn btn-danger px-4 fw-semibold';
      const puedeConfirmar = motivoValido;
      btnConfirmarAccion.disabled = !puedeConfirmar;
    }
  }

  /**
   * Conmuta la interfaz entre el modo "Reprogramar" [17.26] y el modo "Cancelar cita" [17.27].
   * @param {'reprogramar'|'cancelar'} nuevoModo 
   */
  function cambiarModo(nuevoModo) {
    if (!puedeModificar) return;
    modoActivo = nuevoModo;

    if (nuevoModo === 'reprogramar') {
      // Toggle buttons pills
      btnToggleReprogramar?.classList.add('active');
      btnToggleCancelar?.classList.remove('active');

      // Título y badge del panel derecho
      if (encabezadoPanelDerecho) encabezadoPanelDerecho.textContent = 'Nueva fecha y hora';
      if (badgeModoActivo) {
        badgeModoActivo.textContent = 'Modo Reprogramación';
        badgeModoActivo.className = 'badge bg-primary-subtle text-primary border';
      }

      // Visibilidad de secciones
      if (seccionReprogramacion) seccionReprogramacion.style.display = 'block';
      if (seccionCancelacion) seccionCancelacion.style.display = 'none';

      // Alerta informativa [17.45]
      if (alertaInformativa) {
        alertaInformativa.className = 'alert alert-info py-2 mb-3 d-flex align-items-center gap-2 small';
      }
      if (alertaInformativaTexto) {
        alertaInformativaTexto.textContent =
          'La cita original no se borra: queda con estado REPROGRAMADA y la nueva cita guarda la referencia a ella. Ambas operaciones van en una sola transacción.';
      }

      // Si no se han cargado franjas aún, cargarlas
      if (franjasActuales.length === 0) {
        cargarFranjas();
      }
    } else {
      // Toggle buttons pills
      btnToggleCancelar?.classList.add('active');
      btnToggleReprogramar?.classList.remove('active');

      // Título y badge del panel derecho
      if (encabezadoPanelDerecho) encabezadoPanelDerecho.textContent = 'Confirmación de cancelación';
      if (badgeModoActivo) {
        badgeModoActivo.textContent = 'Modo Cancelación';
        badgeModoActivo.className = 'badge bg-danger-subtle text-danger border';
      }

      // Visibilidad de secciones
      if (seccionReprogramacion) seccionReprogramacion.style.display = 'none';
      if (seccionCancelacion) seccionCancelacion.style.display = 'block';

      // Alerta informativa adaptada a Cancelación [17.45]
      if (alertaInformativa) {
        alertaInformativa.className = 'alert alert-warning py-2 mb-3 d-flex align-items-center gap-2 small';
      }
      if (alertaInformativaTexto) {
        alertaInformativaTexto.textContent =
          'La cita quedará con estado CANCELADA y la franja horaria quedará libre.';
      }

      // Ocultar alerta de conflicto si estaba visible
      if (alertaConflicto) alertaConflicto.style.display = 'none';
    }

    actualizarBotonConfirmar();
  }

  /**
   * Consulta las franjas horarias disponibles para el médico y fecha seleccionados.
   * @param {boolean} conservarAlertaConflicto Si es true, no oculta la alerta de conflicto actual
   */
  async function cargarFranjas(conservarAlertaConflicto = false) {
    if (!puedeModificar || modoActivo !== 'reprogramar') return;

    const medicoId = selectProfesional?.value || medicoIdOriginal;
    const fecha = inputFecha?.value;

    franjaSeleccionada = null;
    if (comparativaFechaNueva) comparativaFechaNueva.textContent = '--';
    if (!conservarAlertaConflicto && alertaConflicto) alertaConflicto.style.display = 'none';
    actualizarBotonConfirmar();

    if (!medicoId || !fecha) {
      window.GrillaFranjas?.limpiar('grillaFranjas', 'Seleccione profesional y fecha para ver las franjas.');
      return;
    }

    // Indicador visual de carga en la grilla
    const contenedorGrilla = $('grillaFranjas');
    if (contenedorGrilla) {
      contenedorGrilla.innerHTML = `
        <div class="text-center py-4 w-100 text-muted small">
          <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
          <div>Consultando disponibilidad de franjas horarias…</div>
        </div>
      `;
    }

    try {
      const data = await api(`/api/agenda/${medicoId}/franjas?fecha=${fecha}`);
      franjasActuales = Array.isArray(data) ? data : [];

      window.GrillaFranjas?.render('grillaFranjas', franjasActuales, {
        onSelect: (franja) => {
          seleccionarFranja(franja);
        },
        seleccionadaInicio: franjaSeleccionada ? franjaSeleccionada.inicio : null,
      });
    } catch (err) {
      if (contenedorGrilla) {
        contenedorGrilla.innerHTML = `
          <div class="alert alert-danger w-100 py-2 small mb-0">
            Error al consultar la agenda del profesional: ${escapeHtml(err.message || 'Error del servidor')}
          </div>
        `;
      }
    }
  }

  /**
   * Registra la selección de una franja y actualiza la fila comparativa [17.41 - 17.44].
   * @param {Object} franja 
   */
  function seleccionarFranja(franja) {
    franjaSeleccionada = franja;

    const fechaValor = inputFecha?.value || '';
    const fechaDDMMAAAA = formatearFechaDDMMAAAA(fechaValor);
    const horaIni = extraerHora(franja.inicio);
    const duracion = Number(franja.duracion_cita || 30);
    const horaFin = franja.fin ? extraerHora(franja.fin) : calcularHoraFin(franja.inicio, duracion);

    // Actualizar tabla comparativa Cita nueva [17.44]
    if (comparativaFechaNueva) {
      comparativaFechaNueva.textContent = `${fechaDDMMAAAA} ${horaIni} - ${horaFin}`;
    }

    // Ocultar alerta de conflicto si el usuario selecciona una franja válida
    if (alertaConflicto) {
      alertaConflicto.style.display = 'none';
      if (alternativasContenedor) alternativasContenedor.innerHTML = '';
    }

    globalScope.HIS?.marcarFormularioSucio?.();
    actualizarBotonConfirmar();
  }

  /**
   * Muestra la alerta de cruce de horario (409 CRUCE_HORARIO) con franjas alternativas.
   * @param {Array<Object>} alternativas 
   * @param {string} horaConflicto 
   */
  function mostrarAlertaConflicto(alternativas = [], horaConflicto = '') {
    if (!alertaConflicto) return;

    if (alertaConflictoTexto) {
      alertaConflictoTexto.textContent = `La franja ${horaConflicto || ''} acaba de ser reservada por otro usuario. Franjas alternativas disponibles:`;
    }

    if (alternativasContenedor) {
      alternativasContenedor.innerHTML = '';
      if (!alternativas || alternativas.length === 0) {
        alternativasContenedor.innerHTML = '<span class="text-muted small">No hay franjas libres adicionales para este día.</span>';
      } else {
        alternativas.forEach((alt) => {
          const btnAlt = document.createElement('button');
          btnAlt.type = 'button';
          btnAlt.className = 'btn btn-sm btn-outline-success bg-white fw-bold shadow-sm';
          const horaAlt = extraerHora(alt.inicio);
          btnAlt.textContent = horaAlt;
          btnAlt.title = `Seleccionar alternativa a las ${horaAlt}`;

          btnAlt.addEventListener('click', (e) => {
            e.preventDefault();
            seleccionarFranja(alt);
            window.GrillaFranjas?.marcarSeleccionada('grillaFranjas', alt.inicio);
          });

          alternativasContenedor.appendChild(btnAlt);
        });
      }
    }

    alertaConflicto.style.display = 'block';
  }

  function formatearEstadosEnTexto(texto) {
    if (!texto) return '';
    const fmt = globalScope.HIS?.formatearEstadoCita;
    const enSala = typeof fmt === 'function' ? fmt('EN_SALA') : 'En sala de espera';
    const noAsistio = typeof fmt === 'function' ? fmt('NO_ASISTIO') : 'No asistió';
    return String(texto)
      .replace(/\bEN_SALA\b/g, enSala)
      .replace(/\bNO_ASISTIO\b/g, noAsistio);
  }

  /**
   * Consulta reactivamente el historial de cambios de la cita desde el endpoint de auditoría.
   */
  async function cargarHistorial() {
    if (!citaId || !historialBody) return;

    try {
      const data = await api(`/api/citas/${encodeURIComponent(citaId)}/historial`);
      const filas = Array.isArray(data) ? data : (data.historial || []);

      if (filas.length > 0) {
        historialBody.innerHTML = filas.map((h) => {
          const fechaTexto = escapeHtml(h.fecha_formateada || (h.fecha ? String(h.fecha).slice(0, 16).replace('T', ' ') : ''));
          const usuarioTexto = escapeHtml(h.usuario || h.usuario_nombre || 'Sistema');
          const cambioRaw = formatearEstadosEnTexto(h.cambio || h.accion || h.detalle || 'Modificación');
          const cambioTexto = escapeHtml(cambioRaw);
          return `
            <tr>
              <td class="small text-nowrap">${fechaTexto}</td>
              <td class="small">${usuarioTexto}</td>
              <td class="small">${cambioTexto}</td>
            </tr>
          `;
        }).join('');
      }
    } catch (e) {
      // Si el backend aún no expone el endpoint o no hay registros, se conservan las filas pre-renderizadas
    }
  }

  /**
   * Ejecuta la confirmación de la acción seleccionada (Reprogramar o Cancelar).
   */
  async function confirmarAccion() {
    if (!puedeModificar) return;

    const motivo = motivoCambio?.value ? motivoCambio.value.trim() : '';
    if (!validarMotivo()) {
      motivoCambio?.focus();
      mostrarMensaje('warning', 'El motivo del cambio es obligatorio y debe contener entre 5 y 200 caracteres.');
      return;
    }

    btnConfirmarAccion.disabled = true;
    const textoOriginal = btnConfirmarAccion.innerHTML;
    btnConfirmarAccion.innerHTML = `
      <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
      Procesando…
    `;

    if (modoActivo === 'reprogramar') {
      if (!franjaSeleccionada || !franjaSeleccionada.inicio) {
        btnConfirmarAccion.disabled = false;
        btnConfirmarAccion.innerHTML = textoOriginal;
        mostrarMensaje('warning', 'Debe seleccionar una franja horaria disponible para la reprogramación.');
        return;
      }

      const medicoId = selectProfesional?.value || medicoIdOriginal;
      const fecha = franjaSeleccionada.inicio;

      try {
        const respuesta = await api(`/api/citas/${citaId}/reprogramar`, {
          method: 'POST',
          body: {
            medico_id: medicoId,
            fecha: fecha,
            motivo: motivo,
          },
        });

        globalScope.HIS?.marcarFormularioLimpio?.();
        globalScope.HIS?.anunciarCambio?.('Cita reprogramada con éxito.');
        mostrarMensaje('success', 'Cita reprogramada con éxito en una sola transacción.');

        const nuevaCitaId = respuesta?.cita_nueva_id || respuesta?.data?.cita_nueva_id || respuesta?.id;
        setTimeout(() => {
          if (nuevaCitaId) {
            globalScope.location.href = `/citas/${nuevaCitaId}?mensaje=Cita+reprogramada+con+%C3%A9xito`;
          } else {
            globalScope.location.href = `/agenda?mensaje=Cita+reprogramada+con+%C3%A9xito`;
          }
        }, 600);

      } catch (err) {
        btnConfirmarAccion.disabled = false;
        btnConfirmarAccion.innerHTML = textoOriginal;

        // 409 CRUCE_HORARIO: franja tomada por concurrencia
        if (err.status === 409 && (err.datos?.codigo === 'CRUCE_HORARIO' || err.message?.includes('tomada'))) {
          const franjaFallidaInicio = franjaSeleccionada.inicio;
          const horaFallida = extraerHora(franjaFallidaInicio);

          // Marcar franja en conflicto visualmente en la grilla
          window.GrillaFranjas?.marcarConflicto('grillaFranjas', franjaFallidaInicio);

          // Deshabilitar confirmación temporalmente y resetear resumen
          franjaSeleccionada = null;
          if (comparativaFechaNueva) comparativaFechaNueva.textContent = '--';
          actualizarBotonConfirmar();

          // Mostrar alerta con alternativas
          mostrarAlertaConflicto(err.datos?.alternativas || [], horaFallida);

          // Refrescar franjas en segundo plano conservando la alerta de conflicto
          cargarFranjas(true);
        } else if (err.status === 422) {
          mostrarMensaje('warning', err.message || 'Datos de validación incorrectos.');
        } else {
          mostrarMensaje('danger', err.message || 'Error al reprogramar la cita médica.');
        }
      }

    } else {
      // Modo Cancelar cita
      try {
        await api(`/api/citas/${citaId}/cancelar`, {
          method: 'POST',
          body: {
            motivo: motivo,
          },
        });

        globalScope.HIS?.marcarFormularioLimpio?.();
        globalScope.HIS?.anunciarCambio?.('Cita cancelada con éxito.');
        mostrarMensaje('success', 'Cita cancelada con éxito y franja horaria liberada.');

        setTimeout(() => {
          globalScope.location.href = `/agenda?mensaje=Cita+cancelada+con+%C3%A9xito`;
        }, 600);

      } catch (err) {
        btnConfirmarAccion.disabled = false;
        btnConfirmarAccion.innerHTML = textoOriginal;

        if (err.status === 409) {
          mostrarMensaje('danger', err.message || 'El estado actual de la cita no permite su cancelación.');
        } else if (err.status === 422) {
          mostrarMensaje('warning', err.message || 'Verifique el motivo de cancelación ingresado.');
        } else {
          mostrarMensaje('danger', err.message || 'Error al cancelar la cita médica.');
        }
      }
    }
  }

  // --- Registro de Listeners de Eventos ---

  // Botones toggle de Acción [17.26 y 17.27]
  if (btnToggleReprogramar) {
    btnToggleReprogramar.addEventListener('click', (e) => {
      e.preventDefault();
      cambiarModo('reprogramar');
    });
  }

  if (btnToggleCancelar) {
    btnToggleCancelar.addEventListener('click', (e) => {
      e.preventDefault();
      cambiarModo('cancelar');
    });
  }

  // Textarea de motivo: validación y conteo reactivo [17.28, 17.29]
  if (motivoCambio) {
    motivoCambio.addEventListener('input', () => {
      globalScope.HIS?.marcarFormularioSucio?.();
      validarMotivo();
      actualizarBotonConfirmar();
    });
    motivoCambio.addEventListener('change', () => {
      globalScope.HIS?.marcarFormularioSucio?.();
      validarMotivo();
      actualizarBotonConfirmar();
    });
    motivoCambio.addEventListener('blur', () => {
      validarMotivo();
      actualizarBotonConfirmar();
    });
  }

  // Select de profesional [17.37] e Input de fecha [17.39]
  if (selectProfesional) {
    selectProfesional.addEventListener('change', () => {
      globalScope.HIS?.marcarFormularioSucio?.();
      cargarFranjas();
    });
  }

  if (inputFecha) {
    inputFecha.addEventListener('input', () => {
      globalScope.HIS?.marcarFormularioSucio?.();
    });
    inputFecha.addEventListener('change', () => {
      globalScope.HIS?.marcarFormularioSucio?.();
      cargarFranjas();
    });
  }

  // Botón Confirmar Acción [17.47]
  if (btnConfirmarAccion) {
    btnConfirmarAccion.addEventListener('click', (e) => {
      e.preventDefault();
      confirmarAccion();
    });
  }

  // --- Inicialización al cargar la vista ---
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('accion') === 'cancelar') {
        cambiarModo('cancelar');
      }
    } catch (_) {}

    validarMotivo();
    actualizarBotonConfirmar();

    if (puedeModificar) {
      cargarFranjas();
    }
    cargarHistorial();
  });

  // Exposición para propósitos de testing y depuración
  globalScope.CitaGestion = {
    cambiarModo,
    validarMotivo,
    seleccionarFranja,
    cargarFranjas,
    confirmarAccion,
    extraerHora,
    formatearFechaDDMMAAAA,
  };
})();
