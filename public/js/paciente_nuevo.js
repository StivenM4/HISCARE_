// public/js/paciente_nuevo.js — Lógica de cliente para la Pantalla C.3 (Registro de paciente nuevo)
(function () {
  'use strict';

  // --- Elementos del DOM ---
  const form = document.getElementById('formPacienteNuevo');
  const tipoDocInput = document.getElementById('tipo_documento');
  const numDocInput = document.getElementById('numero_documento');
  const feedbackNumDoc = document.getElementById('feedbackNumeroDocumento');
  const nombresInput = document.getElementById('nombres');
  const apellidosInput = document.getElementById('apellidos');
  const fechaNacInput = document.getElementById('fecha_nacimiento');
  const spanEdad = document.getElementById('spanEdad');
  const feedbackFechaNac = document.getElementById('feedbackFechaNacimiento');
  const sexoInput = document.getElementById('sexo');
  const telefonoInput = document.getElementById('telefono');
  const direccionInput = document.getElementById('direccion');

  // Alerta verificación online C3-33
  const contenedorAlertaDoc = document.getElementById('contenedorAlertaDoc');
  const alertaVerificacionDoc = document.getElementById('alertaVerificacionDoc');
  const iconoDocVerif = document.getElementById('iconoDocVerif');
  const mensajeDocVerif = document.getElementById('mensajeDocVerif');
  const btnAbrirFichaExistente = document.getElementById('btnAbrirFichaExistente');

  // Afiliación C3-34 a C3-42
  const aseguradoraSelect = document.getElementById('aseguradora_id');
  const tipoUsuarioSelect = document.getElementById('tipo_usuario');
  const numeroContratoInput = document.getElementById('numero_contrato');
  const fechaInicioInput = document.getElementById('fecha_inicio');
  const fechaFinInput = document.getElementById('fecha_fin');
  const feedbackVigencia = document.getElementById('feedbackVigencia');

  // Contactos de emergencia C3-43 a C3-50
  const contenedorContactos = document.getElementById('contenedorContactos');
  const btnAgregarContacto = document.getElementById('btnAgregarContacto');

  // Acciones C3-51 y C3-52
  const btnCancelar = document.getElementById('btnCancelar');
  const btnGuardar = document.getElementById('btnGuardar');
  const spinnerGuardar = document.getElementById('spinnerGuardar');
  const textoBtnGuardar = document.getElementById('textoBtnGuardar');

  // Utilidad de debounce local por si no estuviera window.HIS
  const debounce = (window.HIS && typeof window.HIS.debounce === 'function')
    ? window.HIS.debounce
    : (fn, delay = 400) => {
        let timer;
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => fn(...args), delay);
        };
      };

  // =========================================================================
  // 1. Verificación online de documento [3.33]
  // =========================================================================
  let ultimoDocVerificado = '';

  async function verificarDocumentoEnLinea() {
    if (!tipoDocInput || !numDocInput) return;
    const tipo = tipoDocInput.value.trim();
    const numero = numDocInput.value.trim();
    const docClave = `${tipo}:${numero}`;

    // Si está vacío o tiene menos de 3 dígitos, ocultar banner y limpiar estados
    if (!numero || numero.length < 3) {
      if (contenedorAlertaDoc) contenedorAlertaDoc.classList.add('d-none');
      numDocInput.classList.remove('is-invalid', 'is-valid');
      ultimoDocVerificado = '';
      return;
    }

    if (docClave === ultimoDocVerificado) return;
    ultimoDocVerificado = docClave;

    try {
      const url = `/api/pacientes/existe?tipo=${encodeURIComponent(tipo)}&numero=${encodeURIComponent(numero)}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });

      if (!res.ok) {
        // En caso de error HTTP no bloqueamos el formulario
        return;
      }

      const resData = await res.json().catch(() => ({}));
      const payload = (resData.data !== undefined) ? resData.data : resData;
      const existe = !!payload.existe;
      const pacienteId = payload.paciente_id || payload.id;
      const nombrePaciente = payload.nombre || (payload.nombres ? `${payload.nombres} ${payload.apellidos || ''}`.trim() : '');

      if (!contenedorAlertaDoc || !alertaVerificacionDoc) return;

      contenedorAlertaDoc.classList.remove('d-none');

      if (existe) {
        // Alerta de paciente duplicado
        alertaVerificacionDoc.className = 'alert alert-warning d-flex align-items-center justify-content-between py-2 px-3 mb-0 rounded-3 shadow-none border border-warning-subtle';
        iconoDocVerif.textContent = '⚠';
        mensajeDocVerif.textContent = `Ya existe un paciente con este documento: ${nombrePaciente || 'Paciente registrado'}`;

        if (pacienteId && btnAbrirFichaExistente) {
          btnAbrirFichaExistente.href = `/pacientes/${pacienteId}`;
          btnAbrirFichaExistente.classList.remove('d-none');
        } else if (btnAbrirFichaExistente) {
          btnAbrirFichaExistente.classList.add('d-none');
        }

        numDocInput.classList.add('is-invalid');
        numDocInput.classList.remove('is-valid');
        if (feedbackNumDoc) {
          feedbackNumDoc.textContent = 'Ya existe un paciente registrado con este tipo y número de documento.';
        }
      } else {
        // Documento disponible
        alertaVerificacionDoc.className = 'alert alert-success d-flex align-items-center justify-content-between py-2 px-3 mb-0 rounded-3 shadow-none border border-success-subtle';
        iconoDocVerif.textContent = '✓';
        mensajeDocVerif.textContent = '✓ Documento disponible: no existe otro paciente con este número';

        if (btnAbrirFichaExistente) {
          btnAbrirFichaExistente.classList.add('d-none');
        }

        numDocInput.classList.remove('is-invalid');
        numDocInput.classList.add('is-valid');
        if (feedbackNumDoc) {
          feedbackNumDoc.textContent = 'Ingrese un número de documento válido (5 a 20 caracteres).';
        }
      }
    } catch (e) {
      // Silenciar errores de conexión temporal durante la verificación anticipada
    }
  }

  const verificarDocumentoDebounced = debounce(verificarDocumentoEnLinea, 400);

  if (numDocInput) {
    numDocInput.addEventListener('input', verificarDocumentoDebounced);
    numDocInput.addEventListener('blur', verificarDocumentoEnLinea);
  }
  if (tipoDocInput) {
    tipoDocInput.addEventListener('change', () => {
      ultimoDocVerificado = '';
      verificarDocumentoEnLinea();
    });
  }

  // =========================================================================
  // 2. Cálculo reactivo de edad [3.25]
  // =========================================================================
  function calcularEdad() {
    if (!fechaNacInput || !spanEdad) return;
    const valor = fechaNacInput.value;

    if (!valor) {
      spanEdad.textContent = '';
      fechaNacInput.classList.remove('is-invalid');
      return;
    }

    const fechaNac = new Date(valor + 'T00:00:00');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (isNaN(fechaNac.getTime())) {
      spanEdad.textContent = '';
      return;
    }

    if (fechaNac > hoy) {
      spanEdad.textContent = '(Fecha futura inválida)';
      spanEdad.className = 'text-danger small fw-semibold ms-1';
      fechaNacInput.classList.add('is-invalid');
      if (feedbackFechaNac) feedbackFechaNac.textContent = 'La fecha de nacimiento no puede ser futura.';
      return;
    }

    let edad = hoy.getFullYear() - fechaNac.getFullYear();
    const mesDif = hoy.getMonth() - fechaNac.getMonth();
    if (mesDif < 0 || (mesDif === 0 && hoy.getDate() < fechaNac.getDate())) {
      edad--;
    }

    if (edad < 0) {
      spanEdad.textContent = '';
      return;
    }

    fechaNacInput.classList.remove('is-invalid');
    spanEdad.className = 'text-primary fw-medium ms-1';
    if (edad === 0) {
      spanEdad.textContent = '(< 1 año)';
    } else {
      spanEdad.textContent = `(${edad} año${edad === 1 ? '' : 's'})`;
    }
  }

  if (fechaNacInput) {
    fechaNacInput.addEventListener('input', calcularEdad);
    fechaNacInput.addEventListener('change', calcularEdad);
  }

  // =========================================================================
  // 3. Carga dinámica de aseguradoras si el select no tiene opciones
  // =========================================================================
  async function cargarAseguradorasSiVacio() {
    if (!aseguradoraSelect) return;
    if (aseguradoraSelect.options.length > 1) return; // ya cargadas por el servidor

    try {
      const res = await fetch('/api/aseguradoras', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      if (!res.ok) return;

      const resData = await res.json().catch(() => ({}));
      const aseguradoras = Array.isArray(resData) ? resData : (resData.data || []);

      if (Array.isArray(aseguradoras) && aseguradoras.length > 0) {
        aseguradoras.forEach((a) => {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = `${a.nombre}${a.tipo_plan ? ' (' + a.tipo_plan + ')' : ''}`;
          aseguradoraSelect.appendChild(opt);
        });
        if (window.HIS && typeof window.HIS.inicializarSelect2 === 'function') {
          window.HIS.inicializarSelect2(aseguradoraSelect);
        }
        // Si hay borrador guardado en localStorage, recuperarlo
        if (window.HIS && typeof window.HIS.recuperarBorradores === 'function') {
          window.HIS.recuperarBorradores();
        }
      }
    } catch (e) {
      // No interrumpir si la API no está lista
    }
  }

  // =========================================================================
  // 4. Contactos de emergencia dinámicos [3.43 a 3.50]
  // =========================================================================
  function actualizarBotonesEliminarContactos() {
    if (!contenedorContactos) return;
    const filas = contenedorContactos.querySelectorAll('.contacto-fila');
    const mostrarEliminar = filas.length > 1;

    filas.forEach((fila) => {
      const btnQuitar = fila.querySelector('.btn-eliminar-contacto');
      if (btnQuitar) {
        if (mostrarEliminar) {
          btnQuitar.classList.remove('d-none');
        } else {
          btnQuitar.classList.add('d-none');
        }
      }
    });
  }

  function enlazarEventoEliminar(fila) {
    const btnQuitar = fila.querySelector('.btn-eliminar-contacto');
    if (btnQuitar) {
      btnQuitar.addEventListener('click', () => {
        const filas = contenedorContactos.querySelectorAll('.contacto-fila');
        if (filas.length > 1) {
          fila.remove();
          actualizarBotonesEliminarContactos();
        }
      });
    }
  }

  function agregarFilaContacto() {
    if (!contenedorContactos) return;
    const filas = contenedorContactos.querySelectorAll('.contacto-fila');
    const nuevoIndice = filas.length;

    const nuevaFila = document.createElement('div');
    nuevaFila.className = 'contacto-fila mb-3 pb-3 border-bottom border-light-subtle';
    nuevaFila.setAttribute('data-contacto-idx', nuevoIndice);

    nuevaFila.innerHTML = `
      <div class="row g-3">
        <div class="col-12 col-md-6">
          <label class="form-label small fw-semibold text-secondary" data-trace="C3-44">Nombre completo</label>
          <input type="text"
                 name="contacto_nombre[]"
                 class="form-control contacto-nombre"
                 placeholder="Marta Rodríguez"
                 data-trace="C3-45"
                 required>
          <div class="invalid-feedback">Ingrese el nombre completo del contacto.</div>
        </div>

        <div class="col-12 col-md-6">
          <label class="form-label small fw-semibold text-secondary" data-trace="C3-46">Parentesco</label>
          <input type="text"
                 list="listaParentescos"
                 name="contacto_parentesco[]"
                 class="form-control contacto-parentesco"
                 placeholder="Esposa, Madre, Hijo..."
                 data-trace="C3-47">
        </div>

        <div class="col-12 col-md-6">
          <label class="form-label small fw-semibold text-secondary" data-trace="C3-48">Teléfono</label>
          <input type="tel"
                 name="contacto_telefono[]"
                 class="form-control contacto-telefono"
                 placeholder="+57 310 987 6543"
                 data-trace="C3-49"
                 required>
          <div class="invalid-feedback">Ingrese el teléfono del contacto.</div>
        </div>

        <div class="col-12 col-md-6 d-flex align-items-end justify-content-between">
          <button type="button" class="btn btn-outline-danger btn-sm btn-eliminar-contacto" aria-label="Quitar contacto">
            <svg width="14" height="14" fill="currentColor" class="bi bi-trash me-1" viewBox="0 0 16 16">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
              <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
            </svg>
            Quitar
          </button>
        </div>
      </div>
    `;

    contenedorContactos.appendChild(nuevaFila);
    enlazarEventoEliminar(nuevaFila);
    actualizarBotonesEliminarContactos();

    const nuevoInputNombre = nuevaFila.querySelector('.contacto-nombre');
    if (nuevoInputNombre) nuevoInputNombre.focus();
  }

  if (contenedorContactos) {
    const filasIniciales = contenedorContactos.querySelectorAll('.contacto-fila');
    filasIniciales.forEach(enlazarEventoEliminar);
    actualizarBotonesEliminarContactos();
  }

  if (btnAgregarContacto) {
    btnAgregarContacto.addEventListener('click', agregarFilaContacto);
  }

  // =========================================================================
  // 5. Validación y Envío del Formulario vía AJAX [3.51, 3.52]
  // =========================================================================
  function limpiarErroresVisuales() {
    if (!form) return;
    const inputsConError = form.querySelectorAll('.is-invalid');
    inputsConError.forEach((el) => el.classList.remove('is-invalid'));
    if (feedbackVigencia) feedbackVigencia.style.display = 'none';
  }

  function resaltarErroresBackend(campos) {
    if (!Array.isArray(campos) || campos.length === 0) return;
    let primerElemento = null;

    campos.forEach((c) => {
      const nombreCampo = typeof c === 'string' ? c : (c.path || c.param || c.campo);
      const msg = typeof c === 'object' && (c.msg || c.mensaje) ? (c.msg || c.mensaje) : null;

      // Mapear nombres backend hacia ids HTML
      let el = null;
      if (nombreCampo) {
        const idSimple = nombreCampo.replace(/^paciente\./, '').replace(/^afiliacion\./, '');
        el = document.getElementById(idSimple) || document.querySelector(`[name="${idSimple}"]`) || document.querySelector(`[name="${nombreCampo}"]`);
      }

      if (el) {
        el.classList.add('is-invalid');
        const feedback = el.closest('.col-12, .col-md-6')?.querySelector('.invalid-feedback');
        if (feedback && msg) {
          feedback.textContent = msg;
        }
        if (!primerElemento) primerElemento = el;
      }
    });

    if (primerElemento) {
      primerElemento.focus();
    }
  }

  function validarFormularioLocal() {
    let valido = true;
    let primerInvalido = null;

    const marcarInvalido = (el, mensaje) => {
      valido = false;
      el.classList.add('is-invalid');
      if (mensaje) {
        const fb = el.closest('.col-12, .col-md-6')?.querySelector('.invalid-feedback');
        if (fb) fb.textContent = mensaje;
      }
      if (!primerInvalido) primerInvalido = el;
    };

    // Tipo de documento
    if (!tipoDocInput.value) marcarInvalido(tipoDocInput, 'Seleccione el tipo de documento.');

    // Número de documento
    const numDoc = numDocInput.value.trim();
    if (!numDoc || numDoc.length < 5 || numDoc.length > 20) {
      marcarInvalido(numDocInput, 'Ingrese un número de documento válido (5 a 20 caracteres).');
    }

    // Nombres y Apellidos
    if (!nombresInput.value.trim()) marcarInvalido(nombresInput, 'Ingrese los nombres del paciente.');
    if (!apellidosInput.value.trim()) marcarInvalido(apellidosInput, 'Ingrese los apellidos del paciente.');

    // Fecha de nacimiento
    if (!fechaNacInput.value) {
      marcarInvalido(fechaNacInput, 'Seleccione la fecha de nacimiento.');
    } else {
      const dNac = new Date(fechaNacInput.value + 'T00:00:00');
      const dHoy = new Date();
      dHoy.setHours(0, 0, 0, 0);
      if (dNac > dHoy) {
        marcarInvalido(fechaNacInput, 'La fecha de nacimiento no puede ser futura.');
      }
    }

    // Sexo
    if (!sexoInput.value) marcarInvalido(sexoInput, 'Seleccione el sexo del paciente.');

    // Aseguradora y Tipo de usuario
    if (!aseguradoraSelect.value) marcarInvalido(aseguradoraSelect, 'Seleccione una EPS / aseguradora.');
    if (!tipoUsuarioSelect.value) marcarInvalido(tipoUsuarioSelect, 'Seleccione el tipo de usuario.');

    // Vigencia: fin >= inicio si ambas están presentes
    if (fechaInicioInput.value && fechaFinInput.value) {
      if (fechaFinInput.value < fechaInicioInput.value) {
        valido = false;
        fechaFinInput.classList.add('is-invalid');
        if (feedbackVigencia) {
          feedbackVigencia.style.display = 'block';
          feedbackVigencia.textContent = 'La fecha fin debe ser mayor o igual a la de inicio.';
        }
        if (!primerInvalido) primerInvalido = fechaFinInput;
      }
    }

    // Contactos de emergencia: al menos 1 con nombre y teléfono
    const filasContactos = contenedorContactos.querySelectorAll('.contacto-fila');
    let alMenosUnContactoValido = false;

    filasContactos.forEach((fila) => {
      const inNombre = fila.querySelector('.contacto-nombre');
      const inTel = fila.querySelector('.contacto-telefono');
      const nombreVal = inNombre ? inNombre.value.trim() : '';
      const telVal = inTel ? inTel.value.trim() : '';

      if (nombreVal && telVal) {
        alMenosUnContactoValido = true;
      } else if (nombreVal && !telVal) {
        marcarInvalido(inTel, 'Ingrese el teléfono del contacto.');
      } else if (!nombreVal && telVal) {
        marcarInvalido(inNombre, 'Ingrese el nombre del contacto.');
      }
    });

    if (!alMenosUnContactoValido) {
      const primerInNombre = filasContactos[0]?.querySelector('.contacto-nombre');
      const primerInTel = filasContactos[0]?.querySelector('.contacto-telefono');
      if (primerInNombre && !primerInNombre.value.trim()) {
        marcarInvalido(primerInNombre, 'Ingrese al menos un contacto de emergencia (nombre obligatorio).');
      }
      if (primerInTel && !primerInTel.value.trim()) {
        marcarInvalido(primerInTel, 'Ingrese el teléfono del contacto de emergencia.');
      }
    }

    if (primerInvalido) primerInvalido.focus();
    return valido;
  }

  function construirPayload() {
    // Recopilar contactos
    const contactos = [];
    const filasContactos = contenedorContactos.querySelectorAll('.contacto-fila');
    filasContactos.forEach((fila) => {
      const nombre = fila.querySelector('.contacto-nombre')?.value.trim() || '';
      const parentesco = fila.querySelector('.contacto-parentesco')?.value.trim() || '';
      const telefono = fila.querySelector('.contacto-telefono')?.value.trim() || '';
      if (nombre && telefono) {
        contactos.push({
          nombre,
          parentesco: parentesco || undefined,
          telefono
        });
      }
    });

    return {
      paciente: {
        tipo_documento: tipoDocInput.value.trim(),
        numero_documento: numDocInput.value.trim(),
        nombres: nombresInput.value.trim(),
        apellidos: apellidosInput.value.trim(),
        fecha_nacimiento: fechaNacInput.value,
        sexo: sexoInput.value,
        telefono: telefonoInput.value.trim() || undefined,
        direccion: direccionInput.value.trim() || undefined
      },
      afiliacion: {
        aseguradora_id: aseguradoraSelect.value,
        tipo_usuario: tipoUsuarioSelect.value,
        numero_contrato: numeroContratoInput.value.trim() || undefined,
        fecha_inicio: fechaInicioInput.value || undefined,
        fecha_fin: fechaFinInput.value || undefined
      },
      contactos
    };
  }

  function activarEstadoCargando(cargando) {
    if (!btnGuardar) return;
    btnGuardar.disabled = cargando;
    if (btnCancelar) btnCancelar.classList.toggle('disabled', cargando);

    if (cargando) {
      if (spinnerGuardar) spinnerGuardar.classList.remove('d-none');
      if (textoBtnGuardar) textoBtnGuardar.textContent = 'Guardando…';
    } else {
      if (spinnerGuardar) spinnerGuardar.classList.add('d-none');
      if (textoBtnGuardar) textoBtnGuardar.textContent = 'Guardar paciente';
    }
  }

  async function manejarSubmit(e) {
    e.preventDefault();
    limpiarErroresVisuales();

    if (!validarFormularioLocal()) {
      if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
        window.HIS.mostrarMensaje('warning', 'Por favor complete todos los campos requeridos correctamente.');
      }
      return;
    }

    const payload = construirPayload();
    activarEstadoCargando(true);

    try {
      const res = await fetch('/api/pacientes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });

      const resData = await res.json().catch(() => ({}));

      if (res.status === 201) {
        // Éxito: Paciente registrado
        const pacienteId = resData.paciente_id || (resData.data && resData.data.paciente_id);

        // Limpiar borradores si la función global existe
        if (window.HIS && typeof window.HIS.limpiarBorrador === 'function') {
          form.querySelectorAll('[data-borrador]').forEach((el) => window.HIS.limpiarBorrador(el));
        }
        window.HIS?.marcarFormularioLimpio?.(form);
        window.HIS?.anunciarCambio?.('Paciente registrado exitosamente.');

        if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
          window.HIS.mostrarMensaje('success', 'Paciente registrado exitosamente. Redirigiendo a su ficha clínica...');
        }

        setTimeout(() => {
          window.location.href = pacienteId ? `/pacientes/${pacienteId}` : '/pacientes';
        }, 300);
        return;
      }

      if (res.status === 409) {
        // Paciente duplicado
        const err = resData.error || resData;
        const dupId = err.paciente_id || resData.paciente_id;
        const dupNombre = err.nombre || (err.datos && err.datos.nombre) || 'Paciente existente';

        if (contenedorAlertaDoc && alertaVerificacionDoc) {
          contenedorAlertaDoc.classList.remove('d-none');
          alertaVerificacionDoc.className = 'alert alert-warning d-flex align-items-center justify-content-between py-2 px-3 mb-0 rounded-3 shadow-none border border-warning-subtle';
          iconoDocVerif.textContent = '⚠';
          mensajeDocVerif.textContent = `Ya existe un paciente con este documento: ${dupNombre}`;

          if (dupId && btnAbrirFichaExistente) {
            btnAbrirFichaExistente.href = `/pacientes/${dupId}`;
            btnAbrirFichaExistente.classList.remove('d-none');
          }
        }

        numDocInput.classList.add('is-invalid');
        numDocInput.focus();

        if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
          window.HIS.mostrarMensaje('warning', err.mensaje || 'Ya existe un paciente con este documento.');
        }
        return;
      }

      if (res.status === 422) {
        // Error de validación de campos
        const err = resData.error || resData;
        const campos = err.campos || (err.datos && err.datos.campos) || [];

        if (Array.isArray(campos) && campos.length > 0) {
          resaltarErroresBackend(campos);
        }

        if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
          window.HIS.mostrarMensaje('warning', err.mensaje || 'Revise los campos señalados con inconsistencias.');
        }
        return;
      }

      // Otros errores del servidor
      const err = resData.error || resData;
      const mensaje = err.mensaje || 'Error al guardar el paciente. Por favor verifique los datos e intente nuevamente.';
      if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
        window.HIS.mostrarMensaje('danger', mensaje);
      } else if (typeof alert === 'function') {
        alert(mensaje);
      }
    } catch (error) {
      if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
        window.HIS.mostrarMensaje('danger', 'Error de comunicación con el servidor. Verifique su conexión.');
      } else if (typeof alert === 'function') {
        alert('Error de comunicación con el servidor. Intente más tarde.');
      }
    } finally {
      activarEstadoCargando(false);
    }
  }

  if (form) {
    form.addEventListener('submit', manejarSubmit);
  }

  // =========================================================================
  // 6. Inicialización al cargar la página
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    cargarAseguradorasSiVacio();

    // Si viene documento precargado o desde query param
    if (numDocInput && numDocInput.value.trim().length >= 3) {
      verificarDocumentoEnLinea();
    }

    // Si viene fecha de nacimiento precargada
    if (fechaNacInput && fechaNacInput.value) {
      calcularEdad();
    }
  });
})();
