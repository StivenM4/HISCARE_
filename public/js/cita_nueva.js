// public/js/cita_nueva.js — Flujo de agendamiento de citas y control de cruces horarios (Pantalla C.16)
(function () {
  'use strict';

  const api = async (url, opts = {}) => {
    if (window.HIS && typeof window.HIS.api === 'function') {
      return await window.HIS.api(url, opts);
    }
    const res = await fetch(url, opts);
    let data = {};
    const contentType = (res.headers && res.headers.get('content-type')) || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (e) {
        data = {};
      }
    } else {
      const texto = await res.text().catch(() => '');
      try {
        data = JSON.parse(texto);
      } catch (e) {
        data = { error: { mensaje: (texto && texto.length < 200 ? texto : '') || ('Error ' + res.status) } };
      }
    }
    if (!res.ok) {
      const err = new Error(data.error?.mensaje || `Error en la petición (${res.status})`);
      err.status = res.status;
      err.datos = data.error || {};
      throw err;
    }
    return data.data !== undefined ? data.data : data;
  };

  const mostrarMensaje = (window.HIS && typeof window.HIS.mostrarMensaje === 'function')
    ? window.HIS.mostrarMensaje
    : (tipo, texto) => {
        if (typeof alert === 'function') alert(texto);
      };

  const escaparHtml = (window.HIS && typeof window.HIS.escaparHtml === 'function')
    ? window.HIS.escaparHtml
    : (str) => {
        if (str == null) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

  const $ = (id) => document.getElementById(id);

  // Referencias del DOM
  const formCita = $('formCita');
  const pacienteId = formCita?.dataset.paciente;
  const selectEspecialidad = $('especialidad');
  const selectProfesional = $('profesional');
  const inputFecha = $('fecha');
  const inputDuracion = $('duracionMinutos');
  const btnConfirmar = $('btnConfirmar');
  const btnCancelar = $('btnCancelar');

  // Elementos de encabezados dinámicos
  const nombreProfesionalHeader = $('nombreProfesionalHeader');
  const fechaHeader = $('fechaHeader');

  // Alerta de conflicto
  const alertaConflicto = $('alertaConflicto');
  const alertaConflictoTexto = $('alertaConflictoTexto');
  const alternativasContenedor = $('alternativasContenedor');

  // Elementos del Resumen de la cita
  const resumenPaciente = $('resumenPaciente');
  const resumenProfesional = $('resumenProfesional');
  const resumenFechaHora = $('resumenFechaHora');
  const resumenEstado = $('resumenEstado');

  // Estado local de la vista
  let seleccion = null; // { inicio, fin, duracion }
  let franjasActuales = [];
  let duracionConfigurada = 30;

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
   * Calcula la hora final sumando la duración en minutos si no está provista.
   * @param {string} inicioStr 
   * @param {number} duracionMin 
   * @returns {string}
   */
  function calcularHoraFin(inicioStr, duracionMin = 30) {
    const hora = extraerHora(inicioStr);
    const [h, m] = hora.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    const fecha = new Date();
    fecha.setHours(h, m + duracionMin, 0, 0);
    const finH = String(fecha.getHours()).padStart(2, '0');
    const finM = String(fecha.getMinutes()).padStart(2, '0');
    return `${finH}:${finM}`;
  }

  /**
   * Actualiza el encabezado del panel 2 ("2. Franjas disponibles de [Profesional] - [Fecha]")
   */
  function actualizarEncabezadoPanel() {
    const nombreProf = selectProfesional?.selectedIndex > 0
      ? selectProfesional.options[selectProfesional.selectedIndex].text
      : '[Profesional]';
    const fechaValor = inputFecha?.value;
    const fechaFormateada = fechaValor ? formatearFechaDDMMAAAA(fechaValor) : '[Fecha]';

    if (nombreProfesionalHeader) nombreProfesionalHeader.textContent = nombreProf;
    if (fechaHeader) fechaHeader.textContent = fechaFormateada;
  }

  /**
   * Restablece el resumen de la cita a su estado inicial sin selección de franja.
   */
  function resetearResumen() {
    seleccion = null;
    if (resumenProfesional) {
      const nombreProf = selectProfesional?.selectedIndex > 0
        ? selectProfesional.options[selectProfesional.selectedIndex].text
        : '';
      const nombreEsp = selectEspecialidad?.selectedIndex > 0
        ? selectEspecialidad.options[selectEspecialidad.selectedIndex].text
        : '';
      resumenProfesional.textContent = nombreProf && nombreEsp ? `${nombreProf} · ${nombreEsp}` : (nombreProf || 'Sin seleccionar');
    }
    if (resumenFechaHora) resumenFechaHora.textContent = 'Sin seleccionar';
    if (resumenEstado) resumenEstado.textContent = 'PROGRAMADA';
    if (btnConfirmar) btnConfirmar.disabled = true;
  }

  /**
   * Actualiza el resumen de la cita cuando una franja es seleccionada.
   * @param {Object} franja 
   */
  function seleccionarFranja(franja) {
    const duracion = Number(franja.duracion_cita || franja.duracion || duracionConfigurada);
    const horaIni = extraerHora(franja.inicio);
    const horaFin = franja.fin ? extraerHora(franja.fin) : calcularHoraFin(franja.inicio, duracion);

    seleccion = {
      inicio: franja.inicio,
      fin: horaFin,
      duracion: duracion,
    };

    // Actualizar campo de duración [16.26]
    if (inputDuracion) {
      inputDuracion.value = `${duracion} minutos`;
    }

    // Actualizar datos del Resumen [16.35]
    if (resumenProfesional) {
      const nombreProf = selectProfesional.options[selectProfesional.selectedIndex]?.text || '';
      const nombreEsp = selectEspecialidad.options[selectEspecialidad.selectedIndex]?.text || '';
      resumenProfesional.textContent = nombreProf && nombreEsp ? `${nombreProf} · ${nombreEsp}` : nombreProf;
    }

    if (resumenFechaHora) {
      const fechaDDMMAAAA = formatearFechaDDMMAAAA(inputFecha.value);
      resumenFechaHora.textContent = `${fechaDDMMAAAA} ${horaIni} - ${horaFin}`;
    }

    if (resumenEstado) {
      resumenEstado.textContent = 'PROGRAMADA';
    }

    // Habilitar botón Confirmar cita [16.45]
    if (btnConfirmar) {
      btnConfirmar.disabled = false;
    }

    // Ocultar alerta de conflicto si el usuario selecciona una franja válida
    if (alertaConflicto) {
      alertaConflicto.style.display = 'none';
      if (alternativasContenedor) alternativasContenedor.innerHTML = '';
    }

    window.HIS?.marcarFormularioSucio?.(formCita);
  }

  /**
   * Carga la lista de profesionales médicos al cambiar la especialidad seleccionada.
   */
  async function onEspecialidadChange() {
    const especialidadId = selectEspecialidad.value;

    selectProfesional.innerHTML = '<option value="">Cargando profesionales…</option>';
    selectProfesional.disabled = true;
    if (typeof window !== 'undefined' && (window.jQuery || window.$)) {
      (window.jQuery || window.$)(selectProfesional).trigger('change');
    }
    window.GrillaFranjas?.limpiar('grillaFranjas');
    if (alertaConflicto) alertaConflicto.style.display = 'none';
    resetearResumen();
    actualizarEncabezadoPanel();

    if (!especialidadId) {
      selectProfesional.innerHTML = '<option value="">Seleccione primero una especialidad…</option>';
      if (typeof window !== 'undefined' && (window.jQuery || window.$)) {
        (window.jQuery || window.$)(selectProfesional).trigger('change');
      }
      return;
    }

    try {
      const profesionales = await api(`/api/especialidades/${encodeURIComponent(especialidadId)}/profesionales`);
      if (!Array.isArray(profesionales) || profesionales.length === 0) {
        selectProfesional.innerHTML = '<option value="">Sin profesionales disponibles para esta especialidad</option>';
        if (typeof window !== 'undefined' && (window.jQuery || window.$)) {
          (window.jQuery || window.$)(selectProfesional).trigger('change');
        }
        return;
      }

      selectProfesional.innerHTML = '<option value="">Seleccione un profesional…</option>' +
        profesionales.map((p) => `<option value="${escaparHtml(p.id)}">${escaparHtml(p.nombre)}</option>`).join('');
      selectProfesional.disabled = false;
      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.inicializarSelect2 === 'function') {
        window.HIS.inicializarSelect2(selectProfesional);
      }
      if (typeof window !== 'undefined' && (window.jQuery || window.$)) {
        (window.jQuery || window.$)(selectProfesional).trigger('change');
      } else {
        selectProfesional.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (err) {
      selectProfesional.innerHTML = '<option value="">Error al cargar profesionales</option>';
      if (typeof window !== 'undefined' && (window.jQuery || window.$)) {
        (window.jQuery || window.$)(selectProfesional).trigger('change');
      }
      mostrarMensaje('danger', err.message || 'No se pudieron consultar los profesionales.');
    }
  }

  /**
   * Carga y renderiza las franjas horarias del médico para la fecha seleccionada.
   */
  async function cargarFranjas() {
    actualizarEncabezadoPanel();
    const medicoId = selectProfesional.value;
    const fecha = inputFecha.value;

    resetearResumen();

    if (!medicoId || !fecha) {
      window.GrillaFranjas?.limpiar('grillaFranjas', 'Seleccione un profesional y fecha para ver las franjas disponibles.');
      return;
    }

    // Mostrar estado de carga en la grilla
    const contenedor = $('grillaFranjas');
    if (contenedor) {
      contenedor.innerHTML = `
        <div class="text-center py-4 w-100 text-muted small">
          <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
          <div>Consultando disponibilidad de franjas…</div>
        </div>
      `;
    }

    try {
      const data = await api(`/api/agenda/${encodeURIComponent(medicoId)}/franjas?fecha=${encodeURIComponent(fecha)}`);
      franjasActuales = Array.isArray(data) ? data : [];

      if (franjasActuales.length > 0) {
        duracionConfigurada = franjasActuales[0].duracion_cita || 30;
        if (inputDuracion) {
          inputDuracion.value = `${duracionConfigurada} minutos`;
        }
      }

      window.GrillaFranjas?.render('grillaFranjas', franjasActuales, {
        onSelect: (franja) => {
          seleccionarFranja(franja);
        },
        seleccionadaInicio: seleccion ? seleccion.inicio : null,
      });
    } catch (err) {
      if (contenedor) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-danger w-100 py-2 small mb-0';
        alertDiv.textContent = `Error al consultar la agenda del profesional: ${(err && err.message) || 'Error del servidor'}`;
        contenedor.innerHTML = '';
        contenedor.appendChild(alertDiv);
      }
    }
  }

  /**
   * Muestra la alerta de conflicto de cruce de horario (409 CRUCE_HORARIO)
   * y dibuja los botones clicables de alternativas cercanas.
   * @param {Array<Object>} alternativas 
   * @param {string} horaConflicto 
   */
  function mostrarAlertaConflicto(alternativas = [], horaConflicto = '') {
    if (!alertaConflicto) return;

    if (alertaConflictoTexto) {
      alertaConflictoTexto.textContent = `La franja ${horaConflicto || ''} acaba de ser reservada por otro usuario. Alternativas cercanas:`;
    }

    if (alternativasContenedor) {
      alternativasContenedor.innerHTML = '';
      if (alternativas.length === 0) {
        alternativasContenedor.innerHTML = '<span class="text-muted small">No hay más franjas libres cercanas para este día.</span>';
      } else {
        alternativas.forEach((alt) => {
          const btnAlt = document.createElement('button');
          btnAlt.type = 'button';
          btnAlt.className = 'btn btn-sm btn-outline-success bg-white fw-bold shadow-sm';
          btnAlt.dataset.alt = alt.inicio;
          if (alt.fin) btnAlt.dataset.fin = alt.fin;
          if (alt.duracion_cita) btnAlt.dataset.duracion = alt.duracion_cita;

          const horaAlt = extraerHora(alt.inicio);
          btnAlt.textContent = horaAlt;
          btnAlt.title = `Seleccionar alternativa a las ${horaAlt}`;

          btnAlt.addEventListener('click', (e) => {
            e.preventDefault();
            // Seleccionar automáticamente la alternativa
            seleccionarFranja(alt);
            window.GrillaFranjas?.marcarSeleccionada('grillaFranjas', alt.inicio);
          });

          alternativasContenedor.appendChild(btnAlt);
        });
      }
    }

    alertaConflicto.style.display = 'block';
  }

  /**
   * Envía la solicitud para agendar y confirmar la cita médica.
   */
  async function confirmarCita() {
    if (!seleccion || !seleccion.inicio) {
      mostrarMensaje('warning', 'Por favor seleccione una franja horaria disponible.');
      return;
    }

    const medicoId = selectProfesional.value;
    if (!medicoId) {
      mostrarMensaje('warning', 'Seleccione un profesional médico.');
      return;
    }

    if (!pacienteId) {
      mostrarMensaje('danger', 'Identificador de paciente no válido.');
      return;
    }

    btnConfirmar.disabled = true;
    const textoOriginal = btnConfirmar.innerHTML;
    btnConfirmar.innerHTML = `
      <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
      Confirmando…
    `;

    try {
      const payload = {
        paciente_id: pacienteId,
        medico_id: medicoId,
        fecha: seleccion.inicio,
        duracion_minutos: seleccion.duracion,
      };

      await api('/api/citas', {
        method: 'POST',
        body: payload,
      });

      window.HIS?.marcarFormularioLimpio?.(formCita);
      window.HIS?.anunciarCambio?.('Cita médica agendada con éxito.');
      mostrarMensaje('success', 'Cita médica agendada con éxito.');

      // Navegación: Sale: Confirmar → /pacientes/:id con mensaje de éxito
      setTimeout(() => {
        window.location.href = `/pacientes/${encodeURIComponent(pacienteId)}?mensaje=Cita+agendada+con+%C3%A9xito`;
      }, 500);

    } catch (err) {
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = textoOriginal;

      // Cruce horario (409) detectado por restricción de exclusión en base de datos
      if (err.datos && err.datos.codigo === 'CRUCE_HORARIO') {
        const horaFallida = extraerHora(seleccion.inicio);
        const franjaFallidaInicio = seleccion.inicio;

        // Marcar la franja fallida como conflicto visualmente en la grilla
        window.GrillaFranjas?.marcarConflicto('grillaFranjas', franjaFallidaInicio);

        // Deshabilitar confirmación temporalmente y resetear resumen
        btnConfirmar.disabled = true;
        if (resumenFechaHora) resumenFechaHora.textContent = 'Conflicto detectado - elija alternativa';

        // Mostrar alerta de conflicto con las alternativas
        mostrarAlertaConflicto(err.datos.alternativas || [], horaFallida);

        // Sincronizar grilla de franjas actualizada del médico
        const fecha = inputFecha.value;
        if (medicoId && fecha) {
          api(`/api/agenda/${encodeURIComponent(medicoId)}/franjas?fecha=${encodeURIComponent(fecha)}`)
            .then((nuevasFranjas) => {
              if (Array.isArray(nuevasFranjas)) {
                franjasActuales = nuevasFranjas;
                window.GrillaFranjas?.render('grillaFranjas', franjasActuales, {
                  onSelect: (franja) => {
                    seleccionarFranja(franja);
                  },
                  conflictoInicio: franjaFallidaInicio,
                });
              }
            })
            .catch(() => {});
        }
      } else {
        mostrarMensaje('danger', err.message || 'No fue posible agendar la cita. Verifique los datos.');
      }
    }
  }

  // Asignación de event listeners
  if (selectEspecialidad) {
    selectEspecialidad.addEventListener('change', () => {
      window.HIS?.marcarFormularioSucio?.(formCita);
      onEspecialidadChange();
    });
  }

  if (selectProfesional) {
    selectProfesional.addEventListener('change', () => {
      window.HIS?.marcarFormularioSucio?.(formCita);
      cargarFranjas();
    });
  }

  if (inputFecha) {
    inputFecha.addEventListener('input', () => {
      window.HIS?.marcarFormularioSucio?.(formCita);
    });
    inputFecha.addEventListener('change', () => {
      window.HIS?.marcarFormularioSucio?.(formCita);
      cargarFranjas();
    });
  }

  if (btnConfirmar) {
    btnConfirmar.addEventListener('click', (e) => {
      e.preventDefault();
      confirmarCita();
    });
  }

  if (btnCancelar) {
    btnCancelar.addEventListener('click', (e) => {
      // Si el enlace ya tiene href="/pacientes/<%= paciente.id %>", navega naturalmente o usa history.back() si vino de C.15
      if (window.history.length > 1) {
        e.preventDefault();
        window.history.back();
      }
    });
  }

  // Inicialización: si la fecha ya tiene valor inicial, actualizar encabezado
  actualizarEncabezadoPanel();

})();
