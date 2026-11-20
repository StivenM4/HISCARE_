// public/js/carga_resultado.js — Lógica de cliente para la Pantalla C.24 (Carga de resultados diagnósticos)
(function () {
  'use strict';

  // Constantes de validación (HIS-F-29 / HIS-E-08)
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  const EXTENSIONES_PERMITIDAS = ['.pdf', '.jpg', '.jpeg', '.png'];
  const MIMETYPES_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];

  // Estado local de la vista
  let ordenActual = null;
  let archivoSeleccionado = null;

  // Elementos del DOM - Búsqueda de Orden
  const inputCodigoOrden = document.getElementById('codigoOrden');
  const btnBuscarOrden = document.getElementById('btnBuscarOrden');
  const alertaOrden = document.getElementById('alertaOrden');
  const mensajeAlertaOrden = document.getElementById('mensajeAlertaOrden');

  // Elementos del DOM - Datos de la Orden
  const valPaciente = document.getElementById('valPaciente');
  const valMedico = document.getElementById('valMedico');
  const valTipo = document.getElementById('valTipo');
  const valEstado = document.getElementById('valEstado');
  const tablaExamenesBody = document.getElementById('tablaExamenesBody');
  const badgeEstadoOrdenHeader = document.getElementById('badgeEstadoOrdenHeader');

  // Elementos del DOM - Formulario de Resultados
  const formResultado = document.getElementById('formResultado');
  const inputInformeTextual = document.getElementById('informeTextual');
  const inputArchivo = document.getElementById('archivoResultado');
  const dropzoneArchivo = document.getElementById('dropzoneArchivo');
  const dropzoneVacio = document.getElementById('dropzoneVacio');
  const dropzoneConArchivo = document.getElementById('dropzoneConArchivo');
  const nombreArchivoValido = document.getElementById('nombreArchivoValido');
  const tamanoArchivoValido = document.getElementById('tamanoArchivoValido');
  const btnQuitarArchivo = document.getElementById('btnQuitarArchivo');
  const badgeArchivoValido = document.getElementById('badgeArchivoValido');
  const bannerErrorArchivo = document.getElementById('bannerErrorArchivo');
  const mensajeErrorArchivo = document.getElementById('mensajeErrorArchivo');
  const inputFechaResultado = document.getElementById('fechaResultado');
  const btnCancelar = document.getElementById('btnCancelar');
  const btnCargarResultado = document.getElementById('btnCargarResultado');
  const alertaResultado = document.getElementById('alertaResultado');
  const mensajeAlertaResultado = document.getElementById('mensajeAlertaResultado');

  /**
   * Escapa caracteres HTML para prevenir XSS.
   */
  function escaparHtml(texto) {
    if (texto === null || texto === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(texto);
    return div.innerHTML;
  }

  /**
   * Formatea el tamaño de un archivo en formato legible (KB o MB).
   */
  function formatearTamano(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Obtiene la fecha actual en formato ISO para inputs datetime-local.
   */
  function obtenerFechaActualIso() {
    const ahora = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}T${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
  }

  /**
   * Muestra mensaje en alerta de orden.
   */
  function mostrarAlertaOrden(mensaje, tipo = 'warning') {
    if (!alertaOrden || !mensajeAlertaOrden) return;
    alertaOrden.className = `alert alert-${tipo} py-2 px-3 small rounded-3 mb-3`;
    mensajeAlertaOrden.textContent = mensaje;
    alertaOrden.classList.remove('d-none');
  }

  /**
   * Oculta la alerta de orden.
   */
  function ocultarAlertaOrden() {
    if (alertaOrden) alertaOrden.classList.add('d-none');
  }

  /**
   * Muestra mensaje en alerta de resultado.
   */
  function mostrarAlertaResultado(mensaje, tipo = 'danger') {
    if (!alertaResultado || !mensajeAlertaResultado) return;
    alertaResultado.className = `alert alert-${tipo} py-2 px-3 small rounded-3 mb-3`;
    mensajeAlertaResultado.textContent = mensaje;
    alertaResultado.classList.remove('d-none');
  }

  /**
   * Oculta la alerta de resultado.
   */
  function ocultarAlertaResultado() {
    if (alertaResultado) alertaResultado.classList.add('d-none');
  }

  /**
   * Muestra error de archivo en el banner [24.36].
   */
  function mostrarErrorArchivo(mensaje) {
    if (!bannerErrorArchivo || !mensajeErrorArchivo) return;
    mensajeErrorArchivo.textContent = mensaje;
    bannerErrorArchivo.classList.remove('d-none');
    if (badgeArchivoValido) badgeArchivoValido.classList.add('d-none');
  }

  /**
   * Oculta el banner de error de archivo [24.36].
   */
  function ocultarErrorArchivo() {
    if (bannerErrorArchivo) bannerErrorArchivo.classList.add('d-none');
  }

  /**
   * Actualiza los datos visuales de la orden asociada en el DOM.
   */
  function renderizarDatosOrden(orden) {
    if (!orden) {
      if (valPaciente) valPaciente.textContent = '—';
      if (valMedico) valMedico.textContent = '—';
      if (valTipo) valTipo.textContent = '—';
      if (valEstado) {
        valEstado.textContent = '—';
        valEstado.className = 'badge bg-secondary';
      }
      if (tablaExamenesBody) {
        tablaExamenesBody.innerHTML = `
          <tr id="filaSinExamenes">
            <td colspan="3" class="text-center text-muted py-3 small">
              Ingrese un código de orden para visualizar los exámenes.
            </td>
          </tr>
        `;
      }
      if (badgeEstadoOrdenHeader) {
        badgeEstadoOrdenHeader.textContent = 'Esperando orden';
        badgeEstadoOrdenHeader.className = 'badge bg-light text-secondary border fw-normal';
      }
      return;
    }

    // Paciente
    let nombrePaciente = '—';
    if (orden.paciente) {
      if (typeof orden.paciente === 'string') {
        nombrePaciente = orden.paciente;
      } else {
        const nom = orden.paciente.nombreCompleto || [orden.paciente.nombres, orden.paciente.apellidos].filter(Boolean).join(' ') || orden.paciente.nombre;
        const doc = orden.paciente.documento || orden.paciente.numero_documento;
        const tipoDoc = orden.paciente.tipoDocumento || orden.paciente.tipo_documento || 'CC';
        nombrePaciente = nom ? (doc ? `${nom} (${tipoDoc} ${doc})` : nom) : '—';
      }
    }
    if (valPaciente) valPaciente.textContent = nombrePaciente;

    // Médico
    let nombreMedico = '—';
    if (orden.medico) {
      if (typeof orden.medico === 'string') {
        nombreMedico = orden.medico;
      } else {
        nombreMedico = orden.medico.nombre || orden.medico.nombres || '—';
      }
    }
    if (valMedico) valMedico.textContent = nombreMedico;

    // Tipo
    if (valTipo) valTipo.textContent = orden.tipo || '—';

    // Estado con badge coloreado
    if (valEstado) {
      valEstado.textContent = orden.estado || '—';
      valEstado.className = 'badge';
      if (orden.estado === 'EN_PROCESO') {
        valEstado.classList.add('bg-primary');
      } else if (orden.estado === 'PENDIENTE') {
        valEstado.classList.add('bg-warning-subtle', 'text-warning-emphasis', 'border', 'border-warning-subtle');
      } else if (orden.estado === 'COMPLETADA') {
        valEstado.classList.add('bg-success');
      } else if (orden.estado === 'CANCELADA') {
        valEstado.classList.add('bg-danger');
      } else {
        valEstado.classList.add('bg-secondary');
      }
    }

    // Cabecera del card de resultados
    if (badgeEstadoOrdenHeader) {
      badgeEstadoOrdenHeader.textContent = `Orden ${orden.codigo || ''} · ${orden.tipo || ''}`;
      badgeEstadoOrdenHeader.className = 'badge bg-primary-subtle text-primary border border-primary-subtle fw-semibold';
    }

    // Tabla de exámenes
    if (tablaExamenesBody) {
      tablaExamenesBody.innerHTML = '';
      const listaExamenes = Array.isArray(orden.examenes) ? orden.examenes : [];
      if (listaExamenes.length === 0) {
        tablaExamenesBody.innerHTML = `
          <tr>
            <td colspan="3" class="text-center text-muted py-3 small">
              No se encontraron exámenes registrados para esta orden.
            </td>
          </tr>
        `;
      } else {
        listaExamenes.forEach((ex) => {
          const cups = ex.cups || ex.codigo || ex.cups_codigo || '—';
          const examen = ex.descripcion || ex.examen || ex.cups_desc || ex.nombre || '—';
          const cantidad = ex.cantidad !== undefined ? ex.cantidad : (ex.cant !== undefined ? ex.cant : 1);

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="ps-3 font-monospace fw-semibold text-primary small">${escaparHtml(cups)}</td>
            <td class="small text-dark">${escaparHtml(examen)}</td>
            <td class="pe-3 text-end font-monospace small">${escaparHtml(String(cantidad))}</td>
          `;
          tablaExamenesBody.appendChild(tr);
        });
      }
    }
  }

  /**
   * Realiza la búsqueda de una orden por código en la API.
   */
  async function buscarOrden(codigo) {
    const codLimpio = (codigo || '').trim().toUpperCase();
    if (!codLimpio) {
      mostrarAlertaOrden('Ingrese o escanee un código de orden válido.', 'warning');
      if (inputCodigoOrden) inputCodigoOrden.focus();
      return;
    }

    ocultarAlertaOrden();
    ocultarAlertaResultado();

    // Estado cargando en el botón
    const textoOriginalBoton = btnBuscarOrden ? btnBuscarOrden.innerHTML : '';
    if (btnBuscarOrden) {
      btnBuscarOrden.disabled = true;
      btnBuscarOrden.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    }

    try {
      const res = await fetch('/api/ordenes/' + encodeURIComponent(codLimpio), {
        headers: { Accept: 'application/json' },
      });

      const resJson = await res.json().catch(() => ({}));

      if (!res.ok) {
        ordenActual = null;
        renderizarDatosOrden(null);

        const errorMsg = (resJson.error && resJson.error.mensaje) ||
                         resJson.mensaje ||
                         `Orden no encontrada o no disponible (HTTP ${res.status})`;

        mostrarAlertaOrden(errorMsg, res.status === 409 ? 'danger' : 'warning');
        if (inputCodigoOrden) {
          inputCodigoOrden.focus();
          inputCodigoOrden.select();
        }
        return;
      }

      // Orden encontrada exitosamente
      ordenActual = resJson.data || resJson;
      renderizarDatosOrden(ordenActual);

      // Si tiene informe previo o foco para continuar
      if (inputInformeTextual) {
        inputInformeTextual.focus();
      }
    } catch (err) {
      ordenActual = null;
      renderizarDatosOrden(null);
      mostrarAlertaOrden('Error de conexión al consultar la orden. Intente nuevamente.', 'danger');
      if (inputCodigoOrden) inputCodigoOrden.focus();
    } finally {
      if (btnBuscarOrden) {
        btnBuscarOrden.disabled = false;
        btnBuscarOrden.innerHTML = textoOriginalBoton;
      }
    }
  }

  /**
   * Valida un archivo seleccionado (extensión y tamaño <= 10 MB).
   */
  function validarArchivo(archivo) {
    if (!archivo) return { valido: false };

    const nombre = archivo.name || '';
    const ext = '.' + nombre.split('.').pop().toLowerCase();
    const mime = (archivo.type || '').toLowerCase();

    // 1. Validar extensión y mimetype
    const esExtPermitida = EXTENSIONES_PERMITIDAS.includes(ext);
    const esMimePermitido = mime ? MIMETYPES_PERMITIDOS.includes(mime) : true;

    if (!esExtPermitida || !esMimePermitido) {
      return {
        valido: false,
        error: `“${nombre}” no es un formato permitido. Solo PDF, JPG o PNG`,
      };
    }

    // 2. Validar tamaño (máx. 10 MB)
    if (archivo.size > MAX_FILE_SIZE_BYTES) {
      return {
        valido: false,
        error: `“${nombre}” excede el tamaño máximo permitido de 10 MB`,
      };
    }

    return { valido: true };
  }

  /**
   * Procesa y actualiza el archivo en la interfaz.
   */
  function seleccionarArchivo(archivo) {
    ocultarErrorArchivo();

    if (!archivo) {
      resetearArchivo();
      return;
    }

    const resultadoValidacion = validarArchivo(archivo);
    if (!resultadoValidacion.valido) {
      resetearArchivo();
      mostrarErrorArchivo(resultadoValidacion.error);
      return;
    }

    // Archivo válido
    archivoSeleccionado = archivo;
    if (nombreArchivoValido) nombreArchivoValido.textContent = archivo.name;
    if (tamanoArchivoValido) tamanoArchivoValido.textContent = formatearTamano(archivo.size);

    if (dropzoneVacio) dropzoneVacio.classList.add('d-none');
    if (dropzoneConArchivo) {
      dropzoneConArchivo.classList.remove('d-none');
      dropzoneConArchivo.classList.add('d-flex');
    }
    if (badgeArchivoValido) {
      badgeArchivoValido.classList.remove('d-none');
      badgeArchivoValido.classList.add('d-inline-flex');
    }
  }

  /**
   * Resetea el selector de archivo al estado vacío.
   */
  function resetearArchivo() {
    archivoSeleccionado = null;
    if (inputArchivo) inputArchivo.value = '';
    if (dropzoneConArchivo) {
      dropzoneConArchivo.classList.add('d-none');
      dropzoneConArchivo.classList.remove('d-flex');
    }
    if (dropzoneVacio) dropzoneVacio.classList.remove('d-none');
    if (badgeArchivoValido) {
      badgeArchivoValido.classList.add('d-none');
      badgeArchivoValido.classList.remove('d-inline-flex');
    }
  }

  /**
   * Limpia todo el formulario y restablece el estado inicial.
   */
  function resetearFormularioCompleto() {
    ordenActual = null;
    if (inputCodigoOrden) inputCodigoOrden.value = '';
    renderizarDatosOrden(null);
    if (inputInformeTextual) inputInformeTextual.value = '';
    resetearArchivo();
    ocultarErrorArchivo();
    ocultarAlertaOrden();
    ocultarAlertaResultado();
    if (inputFechaResultado) inputFechaResultado.value = obtenerFechaActualIso();
    if (inputCodigoOrden) inputCodigoOrden.focus();
  }

  /**
   * Envía el formulario de resultados a la API con FormData.
   */
  async function enviarResultado(e) {
    if (e && e.preventDefault) e.preventDefault();
    ocultarAlertaResultado();

    // 1. Validar que haya orden asociada
    if (!ordenActual || !ordenActual.id) {
      mostrarAlertaResultado('Debe buscar y seleccionar una orden diagnóstica válida antes de cargar el resultado.', 'warning');
      if (inputCodigoOrden) {
        inputCodigoOrden.focus();
        inputCodigoOrden.select();
      }
      return;
    }

    const textoInforme = (inputInformeTextual ? inputInformeTextual.value : '').trim();

    // 2. Validar que al menos haya informe o archivo (HIS-F-27 / HIS-E-08)
    if (!textoInforme && !archivoSeleccionado) {
      mostrarAlertaResultado('Debe ingresar un informe textual o adjuntar un archivo.', 'danger');
      if (inputInformeTextual) inputInformeTextual.focus();
      return;
    }

    // 3. Preparar FormData
    const formData = new FormData();
    if (textoInforme) {
      formData.append('informe', textoInforme);
    }
    if (archivoSeleccionado) {
      formData.append('archivo', archivoSeleccionado);
    }
    const fechaVal = inputFechaResultado ? inputFechaResultado.value : obtenerFechaActualIso();
    if (fechaVal) {
      formData.append('fecha_resultado', fechaVal);
    }

    // 4. Enviar a la API
    const textoOriginalSubmit = btnCargarResultado ? btnCargarResultado.innerHTML : '';
    if (btnCargarResultado) {
      btnCargarResultado.disabled = true;
      btnCargarResultado.innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        <span>Cargando y notificando...</span>
      `;
    }

    try {
      const urlEnvio = `/api/ordenes/${encodeURIComponent(ordenActual.id)}/resultados`;
      const res = await fetch(urlEnvio, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });

      const resJson = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = (resJson.error && resJson.error.mensaje) ||
                         resJson.mensaje ||
                         `Error al registrar el resultado (HTTP ${res.status})`;

        mostrarAlertaResultado(errorMsg, 'danger');
        if (btnCargarResultado) {
          btnCargarResultado.disabled = false;
          btnCargarResultado.innerHTML = textoOriginalSubmit;
        }
        return;
      }

      // Éxito: 201 Creado
      const mensajeExito = 'Resultado cargado exitosamente. La orden fue completada y se notificó al médico.';
      if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
        window.HIS.mostrarMensaje('success', mensajeExito);
      }
      mostrarAlertaResultado(mensajeExito, 'success');

      // Limpiar y preparar para la siguiente orden
      resetearFormularioCompleto();
      window.HIS?.marcarFormularioLimpio?.(formResultado);
      window.HIS?.anunciarCambio?.('Resultado diagnóstico cargado y orden completada.');
    } catch (err) {
      mostrarAlertaResultado('Error de conexión al enviar el resultado. Intente nuevamente.', 'danger');
    } finally {
      if (btnCargarResultado) {
        btnCargarResultado.disabled = false;
        btnCargarResultado.innerHTML = textoOriginalSubmit;
      }
    }
  }

  // =========================================================================
  // Inicialización y Eventos
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Foco automático o precarga desde URL [24.17]
    if (inputCodigoOrden) {
      const urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
      const ordenFromUrl = urlParams ? urlParams.get('orden') : null;
      if (ordenFromUrl && !inputCodigoOrden.value) {
        inputCodigoOrden.value = ordenFromUrl;
      }

      // Enter busca o lector de código de barras
      inputCodigoOrden.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          buscarOrden(inputCodigoOrden.value);
        }
      });

      if (inputCodigoOrden.value && inputCodigoOrden.value.trim()) {
        buscarOrden(inputCodigoOrden.value.trim());
      } else {
        inputCodigoOrden.focus();
      }
    }

    if (btnBuscarOrden) {
      btnBuscarOrden.addEventListener('click', () => {
        buscarOrden(inputCodigoOrden ? inputCodigoOrden.value : '');
      });
    }

    // 2. Drag & Drop y Selector en Dropzone [24.34]
    if (dropzoneArchivo && inputArchivo) {
      dropzoneArchivo.addEventListener('click', (e) => {
        // Si el clic fue en el botón de quitar archivo, no reabrir el selector
        if (e.target.closest('#btnQuitarArchivo')) return;
        inputArchivo.click();
      });

      dropzoneArchivo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputArchivo.click();
        }
      });

      inputArchivo.addEventListener('change', () => {
        if (inputArchivo.files && inputArchivo.files[0]) {
          seleccionarArchivo(inputArchivo.files[0]);
        }
      });

      ['dragenter', 'dragover'].forEach((eventName) => {
        dropzoneArchivo.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzoneArchivo.classList.add('is-dragover');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        dropzoneArchivo.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzoneArchivo.classList.remove('is-dragover');
        });
      });

      dropzoneArchivo.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) {
          seleccionarArchivo(dt.files[0]);
        }
      });
    }

    if (btnQuitarArchivo) {
      btnQuitarArchivo.addEventListener('click', (e) => {
        e.stopPropagation();
        resetearArchivo();
        ocultarErrorArchivo();
      });
    }

    // 3. Botón Cancelar [24.41]
    if (btnCancelar) {
      btnCancelar.addEventListener('click', () => {
        resetearFormularioCompleto();
      });
    }

  /**
   * Genera plantilla clínica de laboratorio realizado adaptada a la orden.
   */
  function generarPlantillaLaboratorio(orden) {
    const nombrePac = (orden && (orden.paciente || orden.paciente_nombre)) ? (orden.paciente || orden.paciente_nombre) : 'Paciente';
    const codigoOrd = (orden && orden.codigo) ? orden.codigo : (inputCodigoOrden ? inputCodigoOrden.value.trim() : 'ORD-SNC');
    let detallesCups = '';
    const procs = (orden && (orden.examenes || orden.procedimientos || orden.items)) || [];
    if (Array.isArray(procs) && procs.length > 0) {
      detallesCups = '\nExámenes procesados según orden ' + codigoOrd + ':\n' +
        procs.map(e => `• [${e.cups || 'CUPS'}] ${e.descripcion || e.nombre || 'Examen'}: Procesado internamente - Normal`).join('\n') + '\n';
    }

    return `LABORATORIO CLÍNICO Y PARACLÍNICOS — SERVICIO CLÍNICO HISCARE
Paciente: ${nombrePac}
Orden médica: ${codigoOrd}
${detallesCups}
PARÁMETROS ANALÍTICOS REALIZADOS:
• Hemoglobina: 14.2 g/dL (Referencia: 13.0 - 17.0 g/dL)
• Hematocrito: 42.5 % (Referencia: 39.0 - 50.0 %)
• Leucocitos totales: 7.400 /µL (Referencia: 4.500 - 11.000 /µL)
• Plaquetas: 245.000 /µL (Referencia: 150.000 - 450.000 /µL)
• Glucosa basal en ayunas: 92 mg/dL (Referencia: 70 - 100 mg/dL)
• Creatinina sérica: 0.88 mg/dL (Referencia: 0.60 - 1.20 mg/dL)
• Nitrógeno ureico (BUN): 14.0 mg/dL (Referencia: 7.0 - 20.0 mg/dL)

INTERPRETACIÓN CLÍNICA:
Muestra procesada y validada en el laboratorio clínico interno HISCARE. Parámetros bioquímicos y hematológicos dentro de límites biológicos de referencia para el paciente. Sin signos de descompensación ni reactantes de fase aguda elevados.`;
  }

  /**
   * Genera plantilla clínica de imágenes / radiología realizada adaptada a la orden.
   */
  function generarPlantillaRadiologia(orden) {
    const nombrePac = (orden && (orden.paciente || orden.paciente_nombre)) ? (orden.paciente || orden.paciente_nombre) : 'Paciente';
    const codigoOrd = (orden && orden.codigo) ? orden.codigo : (inputCodigoOrden ? inputCodigoOrden.value.trim() : 'ORD-SNC');
    let detallesCups = '';
    const procs = (orden && (orden.examenes || orden.procedimientos || orden.items)) || [];
    if (Array.isArray(procs) && procs.length > 0) {
      detallesCups = '\nEstudios realizados según orden ' + codigoOrd + ':\n' +
        procs.map(e => `• [${e.cups || 'CUPS'}] ${e.descripcion || e.nombre || 'Estudio'}: Proyecciones estándar adquiridas`).join('\n') + '\n';
    }

    return `ESTUDIO DIAGNÓSTICO POR IMÁGENES — SERVICIO CLÍNICO HISCARE
Paciente: ${nombrePac}
Orden médica: ${codigoOrd}
${detallesCups}
TÉCNICA Y PROYECCIONES:
Estudio radiológico digital en proyecciones estándar posteroanterior (PA) y lateral. Técnica adecuada con buena penetración e inspiración profunda.

HALLAZGOS:
1. Campos pleuropulmonares: Adecuada expansión torácica. Sin evidencia de consolidaciones alveolares, opacidades focales, atelectasias ni derrame pleural.
2. Silueta cardiomediastínica: Índice cardiotorácico conservado (< 0.50), contornos mediastínicos y vasculares de configuración anatómica normal.
3. Estructuras óseas y partes blandas: Integridad de la reja costal y clavículas, sin lesiones líticas ni fracturas visibles.

IMPRESIÓN DIAGNÓSTICA:
Estudio radiológico dentro de límites normales. Procesado y validado internamente en el servicio de radiología HISCARE.`;
  }

    // 4. Formulario de Resultados [24.42]
    if (formResultado) {
      formResultado.addEventListener('submit', enviarResultado);
    }

    // 5. Botonera rápida: Simular resultado realizado del paciente
    const btnSimularLab = document.getElementById('btnSimularLab');
    const btnSimularRx = document.getElementById('btnSimularRx');

    if (btnSimularLab && inputInformeTextual) {
      btnSimularLab.addEventListener('click', () => {
        inputInformeTextual.value = generarPlantillaLaboratorio(ordenActual);
        inputInformeTextual.focus();
      });
    }

    if (btnSimularRx && inputInformeTextual) {
      btnSimularRx.addEventListener('click', () => {
        inputInformeTextual.value = generarPlantillaRadiologia(ordenActual);
        inputInformeTextual.focus();
      });
    }
  });
})();
