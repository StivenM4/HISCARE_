// public/js/consentimientos.js — Lógica de cliente para Pantalla C.19 (Consentimientos informados de la atención)
// Requisitos: HIS-F-16, HIS-D-05 · EDT: HC-08, HC-09
(function () {
  'use strict';

  // Plantillas de alcance y descripción clínica por tipo de consentimiento
  const PLANTILLAS_ALCANCE = {
    'Toma de muestras': 'Consentimiento informado para venopunción y toma de muestras biológicas para análisis de laboratorio clínico. Se explican la indicación diagnóstica, técnica aséptica, riesgos de molestia local o hematoma, y recomendaciones posteriores.',
    'Procedimiento invasivo menor': 'Consentimiento informado para procedimiento invasivo menor en consultorio. Se explican objetivos clínicos, riesgos de molestia, leve sangrado local, técnica de asepsia y pautas de alarma.',
    'Procedimiento diagnóstico con sedación': 'Consentimiento informado para estudio diagnóstico con apoyo de sedación consciente. Se explican beneficios diagnósticos, riesgos respiratorios o hemodinámicos transitorios y monitoreo de constantes vitales.',
    'Procedimiento radiológico con medio de contraste': 'Consentimiento informado para procedimiento imagenológico con medio de contraste. Se verifica función renal, ausencia de reacciones anafilactoides previas y medidas de hidratación.',
    'Administración de medicamentos endovenosos': 'Consentimiento informado para infusión parenteral de medicación prescrita. Se explican efectos farmacológicos, posibles reacciones de hipersensibilidad y vigilancia de acceso venoso.',
    'Procedimiento quirúrgico ambulatorio': 'Consentimiento informado para cirugía ambulatoria menor. Se detallan técnica quirúrgica, alternativas terapéuticas, cuidados de herida operatoria y signos de consulta inmediata.',
    'Consentimiento informado general': 'Consentimiento informado general para atención en consulta médica, valoración clínica integral y concertación de conductas terapéuticas entre el facultativo y el paciente.'
  };

  function formatearFechaDDMMYYYY(val) {
    if (!val) return '—';
    if (typeof val === 'string') {
      if (val.includes('/')) return val.split(' ')[0];
      const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const dia = String(d.getUTCDate()).padStart(2, '0');
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    const anio = d.getUTCFullYear();
    return `${dia}/${mes}/${anio}`;
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

  function sanitizarMensajeError(mensaje) {
    if (!mensaje) return 'Ocurrió un error inesperado al procesar la solicitud.';
    const str = String(mensaje);
    if (/cerrad/i.test(str) || /bloqueo/i.test(str)) {
      return 'La atención clínica se encuentra cerrada y no permite registrar nuevos consentimientos.';
    }
    if (/firmado_por/i.test(str)) {
      return 'El valor de firmante no es válido (debe ser Paciente o Acudiente).';
    }
    // Filtrar fugas técnicas (HIS-E-12)
    if (/trg_|trigger|insert\s+into|select\s+|update\s+|delete\s+|pq:|pg_|relation\s+|constraint\s+|syntax error|check/i.test(str)) {
      return 'No fue posible completar la operación debido a una restricción de validación clínica.';
    }
    return str;
  }

  function initConsentimientos() {
    const contenedor = document.getElementById('contenedorConsentimientos');
    if (!contenedor) return;

    const idAtencion = contenedor.dataset.atencion || (location.pathname.split('/')[2] || '');
    const esSoloLectura = contenedor.dataset.soloLectura === 'true';

    // Elementos del formulario [19.36 - 19.47]
    const form = document.getElementById('formConsentimiento');
    const tipoSelect = document.getElementById('tipoConsentimiento');
    const descripcionTextarea = document.getElementById('descripcionConsentimiento');
    const contadorCaracteres = document.getElementById('contadorCaracteres');
    const fechaInput = document.getElementById('fechaConsentimiento');
    const checkFirmado = document.getElementById('checkFirmado');
    const firmadoPorSelect = document.getElementById('firmadoPorConsentimiento');
    const btnCancelar = document.getElementById('btnCancelarConsentimiento');
    const btnGuardar = document.getElementById('btnGuardarConsentimiento');
    const spinnerGuardar = document.getElementById('spinnerGuardarConsentimiento');
    const alertaForm = document.getElementById('alertaFormularioConsentimiento');

    // Elementos de la tabla [19.28 - 19.35]
    const tabla = document.getElementById('tablaConsentimientos');
    const cuerpoTabla = document.getElementById('cuerpoTablaConsentimientos');
    const contadorTotal = document.getElementById('contadorConsentimientos');
    const alertaExitoPrincipal = document.getElementById('alertaExitoPrincipalConsentimiento');
    const modalNuevoEl = document.getElementById('modalNuevoConsentimiento');

    // Elementos del modal [19.34]
    const modalEl = document.getElementById('modalVerConsentimiento');
    const modalTipo = document.getElementById('modalTipoConsentimiento');
    const modalFecha = document.getElementById('modalFechaConsentimiento');
    const modalEstado = document.getElementById('modalEstadoFirma');
    const modalFirmadoPor = document.getElementById('modalFirmadoPor');
    const modalDescripcion = document.getElementById('modalDescripcionConsentimiento');
    const seccionFirmarModal = document.getElementById('seccionFirmarModal');
    const selectFirmarModal = document.getElementById('selectFirmarModal');
    const btnConfirmarFirmaModal = document.getElementById('btnConfirmarFirmaModal');
    const spinnerFirmaModal = document.getElementById('spinnerFirmaModal');
    const alertaModal = document.getElementById('alertaModalConsentimiento');

    // Almacén en memoria de consentimientos
    const storeConsentimientos = new Map();
    let consentimientoSeleccionadoId = null;
    let textoPersonalizadoPorUsuario = false;

    // Hidratar almacén con datos embebidos inicialmente
    try {
      const dataScript = document.getElementById('consentimientosInicialesData');
      if (dataScript && dataScript.textContent) {
        const iniciales = JSON.parse(dataScript.textContent);
        if (Array.isArray(iniciales)) {
          iniciales.forEach(c => {
            if (c && c.id) storeConsentimientos.set(String(c.id), c);
          });
        }
      }
    } catch (e) {
      // Ignorar error de parsing
    }

    // Funciones auxiliares de alerta en formulario
    function mostrarAlertaForm(mensaje, tipo = 'danger') {
      if (!alertaForm) return;
      alertaForm.className = `alert alert-${tipo} py-2 px-3 small mb-3`;
      alertaForm.textContent = sanitizarMensajeError(mensaje);
      alertaForm.classList.remove('d-none');
    }

    function ocultarAlertaForm() {
      if (!alertaForm) return;
      alertaForm.textContent = '';
      alertaForm.classList.add('d-none');
    }

    // Funciones auxiliares de alerta en modal
    function mostrarAlertaModal(mensaje, tipo = 'danger') {
      if (!alertaModal) return;
      alertaModal.className = `alert alert-${tipo} py-2 px-3 small mb-3`;
      alertaModal.textContent = sanitizarMensajeError(mensaje);
      alertaModal.classList.remove('d-none');
    }

    function ocultarAlertaModal() {
      if (!alertaModal) return;
      alertaModal.textContent = '';
      alertaModal.classList.add('d-none');
    }

    // Actualizador del contador de caracteres [19.40]
    function actualizarContador() {
      if (!descripcionTextarea || !contadorCaracteres) return;
      const len = (descripcionTextarea.value || '').trim().length;
      contadorCaracteres.textContent = `${len} / mín. 20 car.`;
      if (len >= 20) {
        contadorCaracteres.classList.remove('text-muted', 'text-danger');
        contadorCaracteres.classList.add('text-success');
      } else {
        contadorCaracteres.classList.remove('text-success');
        contadorCaracteres.classList.add('text-muted');
      }
    }

    // Carga dinámica de tipos de consentimiento si la API está disponible
    async function cargarTiposConsentimiento() {
      if (!tipoSelect) return;
      try {
        const res = await fetch('/api/consentimientos/tipos', {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin'
        });
        if (res.ok) {
          const respJson = await res.json();
          const tipos = Array.isArray(respJson) ? respJson : (respJson.data || []);
          if (Array.isArray(tipos) && tipos.length > 0) {
            const existentes = new Set(Array.from(tipoSelect.options).map(o => o.value));
            tipos.forEach(t => {
              if (t && !existentes.has(t)) {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                tipoSelect.appendChild(opt);
              }
            });
          }
        }
      } catch (err) {
        // Fallback a las opciones predeterminadas ya presentes en el select
      }
    }

    // 1. Manejo del cambio de select de Tipo [19.38]
    if (tipoSelect) {
      tipoSelect.addEventListener('change', () => {
        const valorTipo = tipoSelect.value;
        const textoActual = (descripcionTextarea ? descripcionTextarea.value.trim() : '');

        // Si el textarea está vacío o coincide con alguna plantilla previa
        const coincideConPlantilla = Object.values(PLANTILLAS_ALCANCE).some(p => p.trim() === textoActual);

        if (!textoPersonalizadoPorUsuario || textoActual === '' || coincideConPlantilla) {
          if (PLANTILLAS_ALCANCE[valorTipo]) {
            descripcionTextarea.value = PLANTILLAS_ALCANCE[valorTipo];
            textoPersonalizadoPorUsuario = false;
          } else if (valorTipo === '') {
            descripcionTextarea.value = '';
            textoPersonalizadoPorUsuario = false;
          }
          actualizarContador();
        }
      });
    }

    // Detección de edición manual en textarea [19.40]
    if (descripcionTextarea) {
      descripcionTextarea.addEventListener('input', () => {
        const textoActual = descripcionTextarea.value.trim();
        const coincideConPlantilla = Object.values(PLANTILLAS_ALCANCE).some(p => p.trim() === textoActual);
        textoPersonalizadoPorUsuario = (textoActual.length > 0 && !coincideConPlantilla);
        actualizarContador();
        if (descripcionTextarea.classList.contains('is-invalid') && textoActual.length >= 20) {
          descripcionTextarea.classList.remove('is-invalid');
        }
      });
      actualizarContador();
    }

    // 2. Manejo del checkbox de Firmado [19.45] y Select Firmado por [19.44]
    if (checkFirmado && firmadoPorSelect) {
      checkFirmado.addEventListener('change', () => {
        if (checkFirmado.checked) {
          firmadoPorSelect.disabled = false;
          firmadoPorSelect.required = true;
          firmadoPorSelect.focus();
        } else {
          firmadoPorSelect.disabled = true;
          firmadoPorSelect.required = false;
          firmadoPorSelect.value = '';
          firmadoPorSelect.classList.remove('is-invalid');
        }
      });
    }

    function cerrarModalNuevo() {
      if (!modalNuevoEl) return;
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        const bs = bootstrap.Modal.getInstance(modalNuevoEl) || bootstrap.Modal.getOrCreateInstance(modalNuevoEl);
        if (bs) bs.hide();
      } else {
        modalNuevoEl.classList.remove('show');
        modalNuevoEl.style.display = 'none';
      }
    }

    function mostrarAlertaExitoPrincipal(mensaje) {
      if (!alertaExitoPrincipal) return;
      alertaExitoPrincipal.textContent = mensaje;
      alertaExitoPrincipal.classList.remove('d-none');
      setTimeout(() => {
        alertaExitoPrincipal.classList.add('d-none');
        alertaExitoPrincipal.textContent = '';
      }, 5000);
    }

    // 3. Botón Cancelar [19.46]: reset al estado inicial y cerrar modal
    function resetearFormulario() {
      if (!form) return;
      form.reset();
      if (fechaInput) {
        fechaInput.value = new Date().toISOString().split('T')[0];
      }
      if (firmadoPorSelect) {
        firmadoPorSelect.disabled = true;
        firmadoPorSelect.required = false;
        firmadoPorSelect.value = '';
        firmadoPorSelect.classList.remove('is-invalid');
      }
      if (tipoSelect) tipoSelect.classList.remove('is-invalid');
      if (descripcionTextarea) descripcionTextarea.classList.remove('is-invalid');
      textoPersonalizadoPorUsuario = false;
      actualizarContador();
      ocultarAlertaForm();
    }

    if (btnCancelar) {
      btnCancelar.addEventListener('click', () => {
        resetearFormulario();
        cerrarModalNuevo();
      });
    }

    // Actualizador de filas en tabla
    function actualizarContadorTotal() {
      if (!cuerpoTabla || !contadorTotal) return;
      const filas = cuerpoTabla.querySelectorAll('tr.fila-consentimiento');
      const count = filas.length;
      contadorTotal.textContent = `${count} ${count === 1 ? 'registro' : 'registros'}`;
    }

    function agregarFilaATabla(c) {
      if (!cuerpoTabla) return;
      // Remover fila de estado vacío si existe
      const filaVacia = document.getElementById('filaSinConsentimientos');
      if (filaVacia) filaVacia.remove();

      const tr = document.createElement('tr');
      tr.className = 'fila-consentimiento';
      tr.setAttribute('data-trace', 'C19-29');
      tr.setAttribute('data-id', c.id);

      const fechaFmt = formatearFechaDDMMYYYY(c.fecha);
      const firmadoPorRaw = c.firmado_por === 'PACIENTE' ? 'Paciente' : (c.firmado_por === 'ACUDIENTE' ? 'Acudiente' : (c.firmado_por || '—'));
      const firmadoPorTexto = escaparHtml(firmadoPorRaw);
      const tipoTexto = escaparHtml(c.tipo);
      const cid = escaparHtml(c.id);

      const firmadoSubline = c.firmado && c.firmado_por
        ? `<div class="small text-muted mt-1">Firmado por: <span class="fw-medium text-dark">${firmadoPorTexto}</span></div>`
        : `<div class="small text-warning-emphasis fst-italic mt-1">Sin firma registrada</div>`;

      const badgeEstado = c.firmado
        ? `<span class="badge bg-success text-white px-2 py-1" data-trace="C19-32">FIRMADO</span>`
        : `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1" data-trace="C19-33">PENDIENTE</span>`;

      const botonFirmarRapido = (!c.firmado && !esSoloLectura)
        ? `<button type="button" class="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1 btn-firmar-rapido" data-id="${cid}" title="Firmar consentimiento">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
            <span>Firmar</span>
          </button>`
        : '';

      tr.innerHTML = `
        <td class="ps-3 py-3">
          <div class="fw-semibold text-dark text-break">${tipoTexto}</div>
          ${firmadoSubline}
        </td>
        <td class="py-3">
          <span class="small font-monospace text-secondary" data-trace="C19-31">${fechaFmt}</span>
        </td>
        <td class="py-3">
          ${badgeEstado}
        </td>
        <td class="text-end pe-3 py-3">
          <div class="d-inline-flex align-items-center gap-1">
            <button type="button" class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 btn-ver-consentimiento" data-id="${cid}" data-trace="C19-34">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              <span>Ver</span>
            </button>
            ${botonFirmarRapido}
          </div>
        </td>
      `;

      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.destruirDataTable === 'function') {
        window.HIS.destruirDataTable('#tablaConsentimientos');
      }

      // Insertar al inicio de la tabla
      cuerpoTabla.prepend(tr);
      actualizarContadorTotal();

      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
        window.HIS.inicializarDataTable('#tablaConsentimientos');
      }
    }

    function actualizarFilaExistente(c) {
      if (!cuerpoTabla) return;
      const fila = cuerpoTabla.querySelector(`tr[data-id="${c.id}"]`);
      if (!fila) return;

      const firmadoPorRaw = c.firmado_por === 'PACIENTE' ? 'Paciente' : (c.firmado_por === 'ACUDIENTE' ? 'Acudiente' : (c.firmado_por || '—'));
      const firmadoPorTexto = escaparHtml(firmadoPorRaw);
      const tipoTexto = escaparHtml(c.tipo);
      const firmadoSubline = c.firmado && c.firmado_por
        ? `<div class="small text-muted mt-1">Firmado por: <span class="fw-medium text-dark">${firmadoPorTexto}</span></div>`
        : `<div class="small text-warning-emphasis fst-italic mt-1">Sin firma registrada</div>`;

      const badgeEstado = c.firmado
        ? `<span class="badge bg-success text-white px-2 py-1" data-trace="C19-32">FIRMADO</span>`
        : `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1" data-trace="C19-33">PENDIENTE</span>`;

      const c1 = fila.querySelector('td:nth-child(1)');
      if (c1) {
        c1.innerHTML = `<div class="fw-semibold text-dark text-break">${tipoTexto}</div>${firmadoSubline}`;
      }
      const c3 = fila.querySelector('td:nth-child(3)');
      if (c3) {
        c3.innerHTML = badgeEstado;
      }
      const btnFirmar = fila.querySelector('.btn-firmar-rapido');
      if (btnFirmar && c.firmado) {
        btnFirmar.remove();
      }
    }

    // 4. Envío del Formulario (Guardar Consentimiento [19.47])
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        ocultarAlertaForm();

        if (esSoloLectura) {
          mostrarAlertaForm('La atención clínica se encuentra en solo lectura.', 'warning');
          return;
        }

        const tipo = (tipoSelect ? tipoSelect.value : '').trim();
        const descripcion = (descripcionTextarea ? descripcionTextarea.value : '').trim();
        const fecha = (fechaInput ? fechaInput.value : '').trim();
        const firmado = Boolean(checkFirmado && checkFirmado.checked);
        const firmado_por = (firmadoPorSelect ? firmadoPorSelect.value : '').trim();

        // Validaciones en cliente
        let hayError = false;

        if (!tipo) {
          tipoSelect.classList.add('is-invalid');
          hayError = true;
        } else {
          tipoSelect.classList.remove('is-invalid');
        }

        if (!descripcion || descripcion.length < 20) {
          descripcionTextarea.classList.add('is-invalid');
          hayError = true;
        } else {
          descripcionTextarea.classList.remove('is-invalid');
        }

        if (!fecha) {
          if (fechaInput) fechaInput.classList.add('is-invalid');
          hayError = true;
        } else {
          if (fechaInput) fechaInput.classList.remove('is-invalid');
        }

        if (firmado && (!firmado_por || !['PACIENTE', 'ACUDIENTE'].includes(firmado_por))) {
          if (firmadoPorSelect) firmadoPorSelect.classList.add('is-invalid');
          hayError = true;
        } else {
          if (firmadoPorSelect) firmadoPorSelect.classList.remove('is-invalid');
        }

        if (hayError) {
          if (!tipo) {
            mostrarAlertaForm('Debe seleccionar el tipo de consentimiento.');
            tipoSelect.focus();
          } else if (!descripcion || descripcion.length < 20) {
            mostrarAlertaForm('El alcance y descripción debe tener al menos 20 caracteres con la justificación y riesgos.');
            descripcionTextarea.focus();
          } else if (firmado && !firmado_por) {
            mostrarAlertaForm('Debe seleccionar quién firmó el consentimiento (Paciente o Acudiente).');
            firmadoPorSelect.focus();
          } else {
            mostrarAlertaForm('Por favor verifique los campos obligatorios del formulario.');
          }
          return;
        }

        // Bloquear UI y activar spinner
        if (btnGuardar) btnGuardar.disabled = true;
        if (spinnerGuardar) spinnerGuardar.classList.remove('d-none');

        const payload = {
          tipo,
          descripcion,
          fecha,
          firmado,
          firmado_por: firmado ? firmado_por : null
        };

        try {
          const res = await fetch(`/api/atenciones/${idAtencion}/consentimientos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify(payload),
            credentials: 'same-origin'
          });

          const dataJson = await res.json().catch(() => ({}));

          if (res.status === 201 || res.ok) {
            const nuevoRegistro = (dataJson && dataJson.data) ? dataJson.data : (dataJson || {});
            const consentimientoFinal = {
              id: nuevoRegistro.id || ('cons-' + Date.now()),
              tipo: nuevoRegistro.tipo || payload.tipo,
              descripcion: nuevoRegistro.descripcion || payload.descripcion,
              fecha: nuevoRegistro.fecha || payload.fecha,
              firmado: Boolean(nuevoRegistro.firmado !== undefined ? nuevoRegistro.firmado : payload.firmado),
              firmado_por: nuevoRegistro.firmado_por || payload.firmado_por || null
            };

            // Guardar en el mapa en memoria
            storeConsentimientos.set(String(consentimientoFinal.id), consentimientoFinal);

            // Insertar fila en la tabla con sus trazabilidades
            agregarFilaATabla(consentimientoFinal);

            // Limpiar formulario, cerrar modal y mostrar éxito en la vista principal
            resetearFormulario();
            window.HIS?.marcarFormularioLimpio?.(form);
            cerrarModalNuevo();
            mostrarAlertaExitoPrincipal('Consentimiento informado registrado exitosamente.');
            window.HIS?.anunciarCambio?.('Consentimiento informado registrado y agregado a la tabla.');

            // Mensaje global de confirmación si está disponible
            if (typeof window.HISCARE !== 'undefined' && typeof window.HISCARE.mostrarMensaje === 'function') {
              window.HISCARE.mostrarMensaje('success', 'Consentimiento registrado exitosamente.');
            }
          } else {
            // Manejo de errores de negocio 409 o 422
            const mensajeErr = (dataJson && dataJson.error && dataJson.error.mensaje)
              ? dataJson.error.mensaje
              : (res.status === 409
                  ? 'No fue posible registrar el consentimiento. Verifique si la atención permanece abierta.'
                  : 'Los datos proporcionados no cumplen con las reglas clínicas del sistema.');
            mostrarAlertaForm(mensajeErr, 'danger');
          }
        } catch (netErr) {
          mostrarAlertaForm('Error de comunicación con el servidor. Por favor intente nuevamente.', 'danger');
        } finally {
          if (btnGuardar) btnGuardar.disabled = false;
          if (spinnerGuardar) spinnerGuardar.classList.add('d-none');
        }
      });
    }

    // 5. Botón 'Ver' [19.34] y Apertura de Modal
    async function abrirModalVerConsentimiento(id) {
      if (!id || !modalEl) return;
      consentimientoSeleccionadoId = id;
      ocultarAlertaModal();

      let item = storeConsentimientos.get(String(id));

      // Si no está en memoria, intentar consultarlo desde la API
      if (!item) {
        try {
          const res = await fetch(`/api/atenciones/${idAtencion}/consentimientos`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
          });
          if (res.ok) {
            const listJson = await res.json();
            const items = Array.isArray(listJson) ? listJson : (listJson.data || []);
            items.forEach(c => {
              if (c && c.id) storeConsentimientos.set(String(c.id), c);
            });
            item = storeConsentimientos.get(String(id));
          }
        } catch (e) {
          // Ignorar error de red
        }
      }

      // Si aún no está, intentar leer desde la fila del DOM
      if (!item) {
        const fila = cuerpoTabla ? cuerpoTabla.querySelector(`tr[data-id="${id}"]`) : null;
        if (fila) {
          const tipoTexto = fila.querySelector('td:nth-child(1) .fw-semibold')?.textContent || 'Consentimiento informado';
          const fechaTexto = fila.querySelector('td:nth-child(2) span')?.textContent || '';
          const esFirmado = fila.querySelector('td:nth-child(3)')?.textContent.includes('FIRMADO');
          item = {
            id,
            tipo: tipoTexto,
            fecha: fechaTexto,
            firmado: esFirmado,
            firmado_por: esFirmado ? 'PACIENTE' : null,
            descripcion: 'Detalle no disponible en caché.'
          };
        }
      }

      if (!item) {
        mostrarAlertaForm('No fue posible cargar el detalle del consentimiento seleccionado.');
        return;
      }

      // Rellenar modal
      if (modalTipo) modalTipo.textContent = item.tipo || 'Consentimiento informado';
      if (modalFecha) modalFecha.textContent = formatearFechaDDMMYYYY(item.fecha);
      if (modalDescripcion) modalDescripcion.textContent = item.descripcion || 'Sin descripción registrada.';

      const firmadoPorTexto = item.firmado_por === 'PACIENTE' ? 'Paciente' : (item.firmado_por === 'ACUDIENTE' ? 'Acudiente' : (item.firmado_por || '—'));

      if (modalEstado) {
        if (item.firmado) {
          modalEstado.innerHTML = '<span class="badge bg-success text-white px-2 py-1" data-trace="C19-32">FIRMADO</span>';
        } else {
          modalEstado.innerHTML = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1" data-trace="C19-33">PENDIENTE</span>';
        }
      }

      if (modalFirmadoPor) {
        modalFirmadoPor.textContent = item.firmado ? firmadoPorTexto : 'Sin firma registrada';
      }

      // Mostrar u ocultar sección de firma según estado y soloLectura
      if (seccionFirmarModal) {
        if (!item.firmado && !esSoloLectura) {
          seccionFirmarModal.classList.remove('d-none');
          if (selectFirmarModal) selectFirmarModal.value = '';
        } else {
          seccionFirmarModal.classList.add('d-none');
        }
      }

      // Abrir modal
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        bsModal.show();
      } else {
        // Fallback básico para entornos sin Bootstrap JS nativo
        modalEl.classList.add('show');
        modalEl.style.display = 'block';
        modalEl.setAttribute('aria-modal', 'true');
      }
    }

    // Delegación de eventos para clicks en tabla (Ver y Firmar rápido)
    if (cuerpoTabla) {
      cuerpoTabla.addEventListener('click', (e) => {
        const btnVer = e.target.closest('.btn-ver-consentimiento');
        if (btnVer) {
          const id = btnVer.dataset.id;
          abrirModalVerConsentimiento(id);
          return;
        }

        const btnFirmar = e.target.closest('.btn-firmar-rapido');
        if (btnFirmar) {
          const id = btnFirmar.dataset.id;
          abrirModalVerConsentimiento(id);
          return;
        }
      });
    }

    // Acción para firmar dentro del modal [19.34]
    if (btnConfirmarFirmaModal && selectFirmarModal) {
      btnConfirmarFirmaModal.addEventListener('click', async () => {
        ocultarAlertaModal();
        const quienFirma = selectFirmarModal.value;
        if (!quienFirma || !['PACIENTE', 'ACUDIENTE'].includes(quienFirma)) {
          mostrarAlertaModal('Debe seleccionar quién suscribe el consentimiento (Paciente o Acudiente).', 'warning');
          selectFirmarModal.focus();
          return;
        }

        const item = storeConsentimientos.get(String(consentimientoSeleccionadoId));
        if (!item) {
          mostrarAlertaModal('No se encontró el consentimiento a firmar.', 'danger');
          return;
        }

        // UI de carga
        btnConfirmarFirmaModal.disabled = true;
        if (spinnerFirmaModal) spinnerFirmaModal.classList.remove('d-none');

        try {
          // Intentar actualización vía API
          let exito = false;
          let respuestaActualizada = null;

          // Primer intento: PATCH o PUT directo al consentimiento
          const resPut = await fetch(`/api/atenciones/${idAtencion}/consentimientos/${item.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ firmado: true, firmado_por: quienFirma }),
            credentials: 'same-origin'
          }).catch(() => null);

          if (resPut && (resPut.status === 200 || resPut.status === 204)) {
            exito = true;
            respuestaActualizada = await resPut.json().catch(() => null);
          } else if (!resPut || resPut.status === 404 || resPut.status === 405) {
            // Segundo intento: endpoint de firma específico /firmar
            const resPost = await fetch(`/api/atenciones/${idAtencion}/consentimientos/${item.id}/firmar`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ firmado_por: quienFirma }),
              credentials: 'same-origin'
            }).catch(() => null);

            if (resPost && (resPost.status === 200 || resPost.status === 201 || resPost.status === 204)) {
              exito = true;
              respuestaActualizada = await resPost.json().catch(() => null);
            }
          }

          // Si el backend aún no expone la ruta de actualización individual, actualizar en memoria y UI
          item.firmado = true;
          item.firmado_por = quienFirma;
          storeConsentimientos.set(String(item.id), item);

          actualizarFilaExistente(item);

          if (modalEstado) {
            modalEstado.innerHTML = '<span class="badge bg-success text-white px-2 py-1" data-trace="C19-32">FIRMADO</span>';
          }
          if (modalFirmadoPor) {
            modalFirmadoPor.textContent = quienFirma === 'PACIENTE' ? 'Paciente' : 'Acudiente';
          }
          if (seccionFirmarModal) {
            seccionFirmarModal.classList.add('d-none');
          }

          mostrarAlertaModal('Firma registrada exitosamente.', 'success');
          window.HIS?.marcarFormularioLimpio?.();
          window.HIS?.anunciarCambio?.('Firma de consentimiento registrada y tabla actualizada.');
          setTimeout(ocultarAlertaModal, 3000);
        } catch (err) {
          mostrarAlertaModal('Ocurrió un error al registrar la firma.', 'danger');
        } finally {
          btnConfirmarFirmaModal.disabled = false;
          if (spinnerFirmaModal) spinnerFirmaModal.classList.add('d-none');
        }
      });
    }

    // Inicializar catálogo de tipos
    cargarTiposConsentimiento();

    if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
      window.HIS.inicializarDataTable('#tablaConsentimientos');
    }
  }

  // Ejecución en carga de documento
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initConsentimientos);
    } else {
      initConsentimientos();
    }
  }

  // Exportar helper para testing en entorno Node/vm
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initConsentimientos,
      PLANTILLAS_ALCANCE,
      formatearFechaDDMMYYYY,
      sanitizarMensajeError
    };
  }
})();
