// public/js/nota_alta.js — Scripts de cliente para Pantalla C.21 (Nota de alta / Epicrisis)
// Requisitos: HIS-F-21, HIS-D-03, HIS-E-07, HIS-E-12, HIS-NF-06

(function () {
  'use strict';

  // Referencias a elementos del DOM
  const contenedor = document.getElementById('contenedorNotaAlta');
  if (!contenedor) return;

  const atencionId = contenedor.dataset.atencionId;
  const esSoloLectura = contenedor.dataset.soloLectura === 'true';

  const resumenInput = document.getElementById('resumenClinico');
  const recomendacionesInput = document.getElementById('recomendacionesSeguimiento');
  const conteoResumen = document.getElementById('conteoResumen');
  const conteoRecomendaciones = document.getElementById('conteoRecomendaciones');

  const btnGuardarBorrador = document.getElementById('btnGuardarBorrador');
  const btnGuardarNotaAlta = document.getElementById('btnGuardarNotaAlta');
  const spinnerBorrador = document.getElementById('spinnerBorrador');
  const spinnerGuardar = document.getElementById('spinnerGuardar');

  const estadoAutoguardado = document.getElementById('estadoAutoguardado');
  const spinnerAutoguardado = document.getElementById('spinnerAutoguardado');
  const textoAutoguardado = document.getElementById('textoAutoguardado');

  const contenedorAlertas = document.getElementById('contenedorAlertasNotaAlta');
  const btnRefrescarResumen = document.getElementById('btnRefrescarResumen');

  // Contenedores de datos precargados [21.38, 21.41, 21.43, 21.45, 21.47]
  const contenedorDiagPrincipal = document.getElementById('contenedorDiagPrincipal');
  const badgeDiagPrincipal = document.getElementById('badgeDiagPrincipal');
  const descDiagPrincipal = document.getElementById('descDiagPrincipal');
  const contenedorDiagSecundarios = document.getElementById('contenedorDiagSecundarios');
  const contenedorProcedimientos = document.getElementById('contenedorProcedimientos');
  const contenedorOrdenes = document.getElementById('contenedorOrdenes');
  const contenedorResultados = document.getElementById('contenedorResultados');

  // Control de estado para autoguardado (debounce 2.5s)
  let timerAutoguardado = null;
  let ultimoResumen = resumenInput ? resumenInput.value : '';
  let ultimasRecomendaciones = recomendacionesInput ? recomendacionesInput.value : '';
  let guardandoBorradorEnCurso = false;

  function sanitizarTextoError(texto) {
    const s = String(texto == null ? '' : texto);
    if (s.includes('SELECT') || s.includes('INSERT') || s.includes('UPDATE') || s.includes('pg_') || s.includes('at eval')) {
      return 'Ocurrió un error en el procesamiento de la solicitud. Por favor verifique los datos o consulte al administrador.';
    }
    return s;
  }

  /**
   * Muestra alertas en la interfaz asegurando que no se expongan
   * detalles internos, stack traces o mensajes SQL (HIS-E-12).
   */
  function mostrarAlerta(mensaje, tipo = 'info', autocloseMs = 6000, opts = {}) {
    if (!contenedorAlertas) return;

    const textoSeguro = sanitizarTextoError(mensaje);

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${tipo} alert-dismissible fade show shadow-sm border py-2 px-3 mb-3`;
    alertDiv.setAttribute('role', 'alert');

    const flexDiv = document.createElement('div');
    flexDiv.className = 'd-flex align-items-center gap-2';

    const contentWrap = document.createElement('div');
    if (opts && opts.titulo) {
      const strong = document.createElement('strong');
      strong.textContent = String(opts.titulo);
      contentWrap.appendChild(strong);
      if (textoSeguro) {
        contentWrap.appendChild(document.createTextNode(' '));
      }
    }
    if (textoSeguro) {
      const span = document.createElement('span');
      span.textContent = textoSeguro;
      contentWrap.appendChild(span);
    }
    if (opts && Array.isArray(opts.detalles) && opts.detalles.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'mb-0 ps-3 mt-1';
      opts.detalles.forEach((det) => {
        const li = document.createElement('li');
        li.textContent = sanitizarTextoError(det);
        ul.appendChild(li);
      });
      contentWrap.appendChild(ul);
    }
    flexDiv.appendChild(contentWrap);

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'btn-close shadow-none p-2';
    btnClose.setAttribute('data-bs-dismiss', 'alert');
    btnClose.setAttribute('aria-label', 'Cerrar');

    alertDiv.appendChild(flexDiv);
    alertDiv.appendChild(btnClose);
    contenedorAlertas.appendChild(alertDiv);

    if (autocloseMs > 0) {
      setTimeout(() => {
        if (alertDiv.parentNode) {
          alertDiv.classList.remove('show');
          setTimeout(() => alertDiv.remove(), 200);
        }
      }, autocloseMs);
    }
  }

  /**
   * Actualiza el badge visual de estado del autoguardado.
   */
  function setEstadoAutoguardado(estado, texto) {
    if (!estadoAutoguardado || !textoAutoguardado) return;
    textoAutoguardado.textContent = texto;

    if (estado === 'guardando') {
      if (spinnerAutoguardado) spinnerAutoguardado.classList.remove('d-none');
      estadoAutoguardado.className = 'badge bg-warning bg-opacity-10 text-warning border border-warning-subtle small d-inline-flex align-items-center gap-1';
    } else if (estado === 'guardado') {
      if (spinnerAutoguardado) spinnerAutoguardado.classList.add('d-none');
      estadoAutoguardado.className = 'badge bg-light text-secondary border small d-inline-flex align-items-center gap-1';
    } else if (estado === 'error') {
      if (spinnerAutoguardado) spinnerAutoguardado.classList.add('d-none');
      estadoAutoguardado.className = 'badge bg-danger bg-opacity-10 text-danger border border-danger-subtle small d-inline-flex align-items-center gap-1';
    }
  }

  /**
   * Actualiza los contadores de caracteres y estilos de validación mínima (HIS-D-03).
   */
  function actualizarContadores() {
    if (resumenInput && conteoResumen) {
      const lenR = resumenInput.value.trim().length;
      conteoResumen.textContent = lenR;
      conteoResumen.className = lenR >= 20 ? 'text-success fw-bold' : 'text-danger fw-bold';
    }
    if (recomendacionesInput && conteoRecomendaciones) {
      const lenRec = recomendacionesInput.value.trim().length;
      conteoRecomendaciones.textContent = lenRec;
      conteoRecomendaciones.className = lenRec >= 20 ? 'text-success fw-bold' : 'text-danger fw-bold';
    }
  }

  /**
   * Guarda el borrador de la epicrisis en el servidor.
   * PUT /api/atenciones/:id/alta/borrador con { resumen, recomendaciones }
   */
  async function guardarBorrador(esAutomatico = false) {
    if (esSoloLectura || !atencionId) return;

    const resumen = resumenInput ? resumenInput.value : '';
    const recomendaciones = recomendacionesInput ? recomendacionesInput.value : '';

    // Si es automático y no ha cambiado el contenido, omitir llamada
    if (esAutomatico && resumen === ultimoResumen && recomendaciones === ultimasRecomendaciones) {
      setEstadoAutoguardado('guardado', 'Borrador al día');
      return;
    }

    if (guardandoBorradorEnCurso) return;
    guardandoBorradorEnCurso = true;

    if (!esAutomatico && btnGuardarBorrador && spinnerBorrador) {
      btnGuardarBorrador.disabled = true;
      spinnerBorrador.classList.remove('d-none');
    }

    setEstadoAutoguardado('guardando', 'Guardando borrador...');

    try {
      const resp = await fetch(`/api/atenciones/${encodeURIComponent(atencionId)}/alta/borrador`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ resumen, recomendaciones })
      });

      if (resp.ok || resp.status === 204) {
        ultimoResumen = resumen;
        ultimasRecomendaciones = recomendaciones;
        setEstadoAutoguardado('guardado', 'Borrador guardado');
        window.HIS?.marcarFormularioLimpio?.();
        if (!esAutomatico) {
          mostrarAlerta('Borrador guardado con éxito.', 'success', 3000);
        }
      } else {
        const errorData = await resp.json().catch(() => ({}));
        setEstadoAutoguardado('error', 'Error al guardar');
        if (!esAutomatico) {
          const mensajeError = (errorData.error && errorData.error.mensaje) || 'No fue posible guardar el borrador en el servidor.';
          mostrarAlerta(mensajeError, 'danger');
        }
      }
    } catch (err) {
      setEstadoAutoguardado('error', 'Error de red');
      if (!esAutomatico) {
        mostrarAlerta('Error de comunicación con el servidor al guardar el borrador.', 'danger');
      }
    } finally {
      guardandoBorradorEnCurso = false;
      if (!esAutomatico && btnGuardarBorrador && spinnerBorrador) {
        btnGuardarBorrador.disabled = false;
        spinnerBorrador.classList.add('d-none');
      }
    }
  }

  /**
   * Programa el autoguardado con debounce de 2.5s ante eventos de tipeo.
   */
  function programarAutoguardado() {
    if (esSoloLectura) return;
    actualizarContadores();
    setEstadoAutoguardado('guardando', 'Cambios pendientes...');
    clearTimeout(timerAutoguardado);
    timerAutoguardado = setTimeout(() => {
      guardarBorrador(true);
    }, 2500);
  }

  /**
   * Guarda de forma definitiva la nota de alta (epicrisis).
   * POST /api/atenciones/:id/alta con { resumen, recomendaciones }
   */
  async function guardarNotaAlta() {
    if (esSoloLectura || !atencionId) return;

    const resumen = resumenInput ? resumenInput.value.trim() : '';
    const recomendaciones = recomendacionesInput ? recomendacionesInput.value.trim() : '';

    // Validación según regla HIS-D-03: mínimo 20 caracteres cada campo
    const errores = [];
    if (resumen.length < 20) {
      errores.push(`El resumen clínico debe tener al menos 20 caracteres (actual: ${resumen.length}).`);
    }
    if (recomendaciones.length < 20) {
      errores.push(`Las recomendaciones terapéuticas y de seguimiento deben tener al menos 20 caracteres (actual: ${recomendaciones.length}).`);
    }

    if (errores.length > 0) {
      mostrarAlerta('', 'warning', 7000, {
        titulo: 'Requisitos pendientes:',
        detalles: errores
      });
      return;
    }

    if (btnGuardarNotaAlta && spinnerGuardar) {
      btnGuardarNotaAlta.disabled = true;
      spinnerGuardar.classList.remove('d-none');
    }

    try {
      const resp = await fetch(`/api/atenciones/${encodeURIComponent(atencionId)}/alta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ resumen, recomendaciones })
      });

      const data = await resp.json().catch(() => ({}));

      if (resp.status === 200 || resp.status === 201) {
        ultimoResumen = resumenInput.value;
        ultimasRecomendaciones = recomendacionesInput.value;
        setEstadoAutoguardado('guardado', 'Nota de alta guardada');
        window.HIS?.marcarFormularioLimpio?.();
        window.HIS?.anunciarCambio?.('Nota de alta registrada exitosamente.');
        mostrarAlerta('Redirigiendo a la pestaña de Cierre...', 'success', 2500, {
          titulo: '¡Nota de alta registrada exitosamente!'
        });

        // Redirigir a Cierre
        setTimeout(() => {
          window.location.href = `/atenciones/${encodeURIComponent(atencionId)}/cierre`;
        }, 1500);
      } else if (resp.status === 409) {
        const msg = (data.error && data.error.mensaje) || 'La atención clínica ya se encuentra cerrada o presenta un conflicto.';
        mostrarAlerta(msg, 'danger', 8000, { titulo: 'Atención cerrada o en conflicto:' });
      } else if (resp.status === 422) {
        const listaCampos = (data.error && data.error.campos) ? data.error.campos : [];
        const detalle = (data.error && data.error.mensaje) || 'Datos incompletos o inválidos para registrar la nota de alta.';
        const detalles = Array.isArray(listaCampos) && listaCampos.length > 0
          ? listaCampos.map(c => (c && (c.msg || c.mensaje || c.campo)) || JSON.stringify(c))
          : [];
        mostrarAlerta(detalle, 'warning', 8000, {
          titulo: 'Error de validación (HTTP 422):',
          detalles
        });
      } else {
        const msg = (data.error && data.error.mensaje) || 'No se pudo guardar la nota de alta.';
        mostrarAlerta(msg, 'danger', 6000, { titulo: 'Error:' });
      }
    } catch (err) {
      mostrarAlerta('Error de comunicación con el servidor al registrar la nota de alta.', 'danger');
    } finally {
      if (btnGuardarNotaAlta && spinnerGuardar) {
        btnGuardarNotaAlta.disabled = false;
        spinnerGuardar.classList.add('d-none');
      }
    }
  }

  /**
   * Consulta y refresca los datos precargados de la atención desde la API.
   * GET /api/atenciones/:id/resumen
   */
  async function sincronizarResumen() {
    if (!atencionId) return;

    try {
      const resp = await fetch(`/api/atenciones/${encodeURIComponent(atencionId)}/resumen`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!resp.ok) return;

      const body = await resp.json();
      const resumen = body.data || body;

      // 1. Diagnósticos
      if (Array.isArray(resumen.diagnosticos) && resumen.diagnosticos.length > 0) {
        const principal = resumen.diagnosticos.find(d => d.tipo === 'PRINCIPAL');
        if (principal) {
          if (badgeDiagPrincipal) {
            badgeDiagPrincipal.textContent = principal.codigo;
            badgeDiagPrincipal.setAttribute('data-trace', 'C21-39');
          }
          if (descDiagPrincipal) {
            descDiagPrincipal.textContent = principal.descripcion;
            descDiagPrincipal.title = principal.descripcion;
          }
        }

        const secundarios = resumen.diagnosticos.filter(d => d.tipo === 'SECUNDARIO');
        if (contenedorDiagSecundarios && secundarios.length > 0) {
          contenedorDiagSecundarios.textContent = secundarios.map(d => `${d.codigo} ${d.descripcion}`).join('; ');
        }
      }

      // 2. Procedimientos
      if (contenedorProcedimientos && Array.isArray(resumen.procedimientos) && resumen.procedimientos.length > 0) {
        contenedorProcedimientos.textContent = resumen.procedimientos
          .map(p => p.codigo || (p.cups_codigo || p.descripcion))
          .join(', ');
      }

      // 3. Órdenes diagnósticas
      if (contenedorOrdenes && Array.isArray(resumen.ordenes) && resumen.ordenes.length > 0) {
        const spanOrdenes = document.createElement('span');
        spanOrdenes.className = 'font-monospace fw-semibold';
        spanOrdenes.textContent = resumen.ordenes.map(o => `${o.codigo || ''} · ${o.estado || ''}`).join(', ');
        contenedorOrdenes.innerHTML = '';
        contenedorOrdenes.appendChild(spanOrdenes);
      }

      // 4. Resultados diagnósticos
      if (contenedorResultados && Array.isArray(resumen.resultados) && resumen.resultados.length > 0) {
        contenedorResultados.innerHTML = '';
        resumen.resultados.forEach((r, idx) => {
          if (idx > 0) {
            contenedorResultados.appendChild(document.createElement('br'));
          }
          const cod = r.codigo || (r.id ? 'RES-...' + String(r.id).slice(-3) : 'RES-...654');
          const spanRes = document.createElement('span');
          spanRes.textContent = `${cod} ${r.revisado ? 'revisado' : 'pendiente'}`;
          contenedorResultados.appendChild(spanRes);
          if (r.revisado) {
            const badgeRev = document.createElement('span');
            badgeRev.className = 'badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 small ms-1';
            badgeRev.textContent = 'Revisado';
            contenedorResultados.appendChild(badgeRev);
          }
        });
      }
      window.HIS?.anunciarCambio?.('Resumen clínico de la atención actualizado.');
    } catch (_) {
      // Si falla la consulta del resumen, se mantienen los datos precargados iniciales de la vista
    }
  }

  // ========================================================
  // Inicialización de escuchadores de eventos
  // ========================================================
  if (!esSoloLectura) {
    if (resumenInput) {
      resumenInput.addEventListener('input', () => {
        window.HIS?.marcarFormularioSucio?.();
        programarAutoguardado();
      });
      resumenInput.addEventListener('change', () => {
        window.HIS?.marcarFormularioSucio?.();
      });
    }
    if (recomendacionesInput) {
      recomendacionesInput.addEventListener('input', () => {
        window.HIS?.marcarFormularioSucio?.();
        programarAutoguardado();
      });
      recomendacionesInput.addEventListener('change', () => {
        window.HIS?.marcarFormularioSucio?.();
      });
    }
    if (btnGuardarBorrador) {
      btnGuardarBorrador.addEventListener('click', () => guardarBorrador(false));
    }
    if (btnGuardarNotaAlta) {
      btnGuardarNotaAlta.addEventListener('click', guardarNotaAlta);
    }
  }

  if (btnRefrescarResumen) {
    btnRefrescarResumen.addEventListener('click', () => {
      sincronizarResumen();
      mostrarAlerta('Datos precargados actualizados.', 'info', 2000);
    });
  }

  // Inicializar contadores al cargar la página
  actualizarContadores();

  // Exponer API pública del cliente para integración y pruebas
  window.HISCARE_NOTA_ALTA = {
    guardarBorrador,
    guardarNotaAlta,
    sincronizarResumen,
    actualizarContadores
  };

})();
