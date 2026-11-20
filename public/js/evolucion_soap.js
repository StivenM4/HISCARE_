// public/js/evolucion_soap.js — Gestión e interacción cliente para Evolución SOAP (C.6, HIS-F-20, HIS-E-06)
(function () {
  'use strict';

  // Obtener helpers de la librería común o fallback local
  const { api, mostrarMensaje, tiempoRelativo } = window.HIS || {
    api: async (url, opts = {}) => {
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: 'same-origin',
      });
      if (res.status === 204) return null;
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error((datos.error && datos.error.mensaje) || 'Error ' + res.status);
        error.status = res.status;
        error.datos = datos.error || {};
        throw error;
      }
      return datos.data !== undefined ? datos.data : datos;
    },
    mostrarMensaje: (tipo, texto) => {
      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
        return window.HIS.mostrarMensaje(tipo, texto);
      }
      const cont = document.getElementById('alertas');
      if (!cont) return (typeof alert === 'function' ? alert(texto) : undefined);
      const div = document.createElement('div');
      div.className = `alert alert-${tipo} alert-dismissible fade show shadow-sm`;
      div.role = 'alert';
      const span = document.createElement('span');
      span.textContent = texto;
      const btnClose = document.createElement('button');
      btnClose.type = 'button';
      btnClose.className = 'btn-close';
      btnClose.setAttribute('data-bs-dismiss', 'alert');
      btnClose.setAttribute('aria-label', 'Cerrar');
      div.appendChild(span);
      div.appendChild(btnClose);
      cont.replaceChildren(div);
      setTimeout(() => { if (div.parentNode) { div.classList.remove('show'); setTimeout(() => div.remove(), 150); } }, 6000);
    },
    tiempoRelativo: (f) => f ? new Date(f).toLocaleTimeString() : '',
  };

  function initEvolucionSoap() {
    const cont = document.getElementById('evolucionSoap');
    if (!cont) return;

    const atencionId = cont.dataset.atencion;
    const soloLectura = cont.dataset.soloLectura === 'true';
    const puedeEditar = cont.dataset.puedeEditar === 'true';

    // Elementos de texto de las dimensiones SOAP
    const txtSubjetivo = document.getElementById('subjetivo');
    const txtObjetivo = document.getElementById('objetivo');
    const txtAnalisis = document.getElementById('analisis');
    const txtPlan = document.getElementById('plan');

    // Botones de pestañas SOAP
    const tabButtons = {
      S: document.getElementById('tabSoapS'),
      O: document.getElementById('tabSoapO'),
      A: document.getElementById('tabSoapA'),
      P: document.getElementById('tabSoapP'),
    };

    // Paneles de contenido SOAP
    const tabPanes = {
      S: document.getElementById('paneSoapS'),
      O: document.getElementById('paneSoapO'),
      A: document.getElementById('paneSoapA'),
      P: document.getElementById('paneSoapP'),
    };

    // Botones de acción e indicadores
    const btnGuardarBorrador = document.getElementById('btnGuardarBorrador');
    const btnCancelar = document.getElementById('btnCancelar');
    const btnFirmarEvolucion = document.getElementById('btnFirmarEvolucion');
    const indicadorBorrador = document.getElementById('indicadorBorrador');
    const textoBorrador = document.getElementById('textoBorrador');
    const spinnerBorrador = document.getElementById('spinnerBorrador');

    // Modal de confirmación
    const modalEl = document.getElementById('modalConfirmarFirma');
    const btnConfirmarFirma = document.getElementById('btnConfirmarFirma');
    let modalInstance = null;
    if (modalEl && window.bootstrap && window.bootstrap.Modal) {
      modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    }

    const STORAGE_KEY = 'hiscare:soap:' + atencionId;

    // 1. Conmutación fluida entre pestañas S, O, A, P
    function activarTab(dim) {
      if (!tabButtons[dim] || !tabPanes[dim]) return;

      Object.keys(tabButtons).forEach((clave) => {
        const btn = tabButtons[clave];
        const pane = tabPanes[clave];
        if (clave === dim) {
          btn.classList.add('active');
          if (pane) pane.classList.remove('d-none');
        } else {
          btn.classList.remove('active');
          if (pane) pane.classList.add('d-none');
        }
      });

      // Enfocar textarea activo si la vista no está deshabilitada
      if (!soloLectura && puedeEditar) {
        const mapTxt = { S: txtSubjetivo, O: txtObjetivo, A: txtAnalisis, P: txtPlan };
        const activeTxt = mapTxt[dim];
        if (activeTxt && !activeTxt.disabled) {
          activeTxt.focus();
        }
      }
    }

    Object.keys(tabButtons).forEach((dim) => {
      const btn = tabButtons[dim];
      if (btn) {
        btn.addEventListener('click', () => activarTab(dim));
      }
    });

    // 2. Carga inicial: restaurar borrador desde localStorage si está disponible
    function restaurarBorradorLocal() {
      try {
        const rawLocal = localStorage.getItem(STORAGE_KEY);
        if (!rawLocal) return;
        const localData = JSON.parse(rawLocal);
        if (!localData || typeof localData !== 'object') return;

        // Comprobar si los campos del DOM están vacíos para hidratar
        const domVacio =
          (!txtSubjetivo || !txtSubjetivo.value.trim()) &&
          (!txtObjetivo || !txtObjetivo.value.trim()) &&
          (!txtAnalisis || !txtAnalisis.value.trim()) &&
          (!txtPlan || !txtPlan.value.trim());

        if (domVacio && (localData.subjetivo || localData.objetivo || localData.analisis || localData.plan)) {
          if (txtSubjetivo && localData.subjetivo) txtSubjetivo.value = localData.subjetivo;
          if (txtObjetivo && localData.objetivo) txtObjetivo.value = localData.objetivo;
          if (txtAnalisis && localData.analisis) txtAnalisis.value = localData.analisis;
          if (txtPlan && localData.plan) txtPlan.value = localData.plan;

          if (textoBorrador) {
            textoBorrador.textContent = 'Borrador recuperado localmente';
          }
        }
      } catch (e) {
        console.warn('Recuperando borrador local:', e);
      }
    }

    restaurarBorradorLocal();

    // Si el usuario no tiene permisos de edición (ej. enfermero o atención cerrada), finalizar configuración
    if (soloLectura || !puedeEditar) {
      return;
    }

    // 3. Mecanismo de persistencia y autoguardado (HIS-E-06, HIS-NF-06)
    function obtenerValores() {
      return {
        subjetivo: txtSubjetivo ? txtSubjetivo.value : '',
        objetivo: txtObjetivo ? txtObjetivo.value : '',
        analisis: txtAnalisis ? txtAnalisis.value : '',
        plan: txtPlan ? txtPlan.value : '',
      };
    }

    let ultimoEstadoGuardado = JSON.stringify(obtenerValores());
    let guardandoBorrador = false;

    async function guardarBorrador(manual = false) {
      if (guardandoBorrador) return;
      const valores = obtenerValores();
      const estadoActual = JSON.stringify(valores);

      // Si no hay cambios y no es manual, omitir petición
      if (!manual && estadoActual === ultimoEstadoGuardado) return;

      guardandoBorrador = true;
      if (spinnerBorrador) spinnerBorrador.classList.remove('d-none');

      try {
        // Persistir en localStorage
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...valores, timestamp: Date.now() }));
        } catch (_) {}

        // Enviar a la API de borrador
        await api(`/api/atenciones/${atencionId}/evoluciones/borrador`, {
          method: 'PUT',
          body: valores,
        });

        ultimoEstadoGuardado = estadoActual;
        const ahora = new Date();
        const hh = String(ahora.getHours()).padStart(2, '0');
        const mm = String(ahora.getMinutes()).padStart(2, '0');
        if (textoBorrador) {
          textoBorrador.textContent = `Borrador guardado automáticamente a las ${hh}:${mm}`;
        }

        if (manual) {
          window.HIS?.marcarFormularioLimpio?.();
          mostrarMensaje('info', 'Borrador guardado exitosamente.');
        }
      } catch (err) {
        console.warn('Error en guardado de borrador:', err);
        if (manual) {
          mostrarMensaje('danger', 'No fue posible guardar el borrador en el servidor.');
        }
      } finally {
        guardandoBorrador = false;
        if (spinnerBorrador) spinnerBorrador.classList.add('d-none');
      }
    }

    // Debounce de guardado automático al tipear en cualquier dimensión
    let debounceTimer = null;
    const camposTexto = [txtSubjetivo, txtObjetivo, txtAnalisis, txtPlan].filter(Boolean);
    camposTexto.forEach((campo) => {
      campo.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => guardarBorrador(false), 1200);
      });
    });

    // Intervalo de seguridad de autoguardado periódico cada 30 segundos
    const intervaloAutoguardado = setInterval(() => guardarBorrador(false), 30000);

    // Botón manual "Guardar borrador" [6.51]
    if (btnGuardarBorrador) {
      btnGuardarBorrador.addEventListener('click', () => guardarBorrador(true));
    }

    // Botón "Cancelar" [6.52]
    if (btnCancelar) {
      btnCancelar.addEventListener('click', async (e) => {
        const valoresActuales = JSON.stringify(obtenerValores());
        if (valoresActuales !== ultimoEstadoGuardado) {
          e.preventDefault();
          const targetUrl = btnCancelar.href || btnCancelar.getAttribute('href');
          const confirmado = (typeof window !== 'undefined' && window.HIS && typeof window.HIS.confirmar === 'function')
            ? await window.HIS.confirmar({
                titulo: 'Cambios sin guardar',
                texto: 'Tiene cambios sin guardar en la evolución. ¿Desea salir igualmente?',
                peligroso: true,
                textoConfirmar: 'Sí, salir',
                textoCancelar: 'Continuar editando'
              })
            : (typeof confirm === 'function' ? confirm('Tiene cambios sin guardar en la evolución. ¿Desea salir igualmente?') : true);
          if (confirmado && targetUrl) {
            window.location.href = targetUrl;
          }
        }
      });
    }

    // 4. Validación y apertura del modal de firma [6.53]
    if (btnFirmarEvolucion) {
      btnFirmarEvolucion.addEventListener('click', () => {
        const sVal = txtSubjetivo ? txtSubjetivo.value.trim() : '';
        const aVal = txtAnalisis ? txtAnalisis.value.trim() : '';

        // Validación clínica: al menos Subjetivo (S) y Análisis (A) obligatorios
        if (!sVal) {
          activarTab('S');
          if (txtSubjetivo) txtSubjetivo.focus();
          mostrarMensaje('warning', 'El campo Subjetivo (S) es obligatorio para firmar la evolución médica.');
          return;
        }

        if (!aVal) {
          activarTab('A');
          if (txtAnalisis) txtAnalisis.focus();
          mostrarMensaje('warning', 'El campo Análisis (A) es obligatorio para firmar la evolución médica.');
          return;
        }

        // Abrir modal de confirmación
        if (modalEl) {
          if (!modalInstance && window.bootstrap && window.bootstrap.Modal) {
            modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
          }
          if (modalInstance) {
            modalInstance.show();
          } else {
            // Fallback en caso de que Bootstrap JS tarde en inicializar
            modalEl.classList.add('show');
            modalEl.style.display = 'block';
          }
        }
      });
    }

    // 5. Envío y sellado definitivo de la evolución médica
    if (btnConfirmarFirma) {
      btnConfirmarFirma.addEventListener('click', async () => {
        btnConfirmarFirma.disabled = true;
        const textoOriginal = btnConfirmarFirma.innerHTML;
        btnConfirmarFirma.innerHTML =
          '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Firmando...';

        try {
          const payload = obtenerValores();
          await api(`/api/atenciones/${atencionId}/evoluciones`, {
            method: 'POST',
            body: payload,
          });

          // Limpiar almacenamiento local tras firma confirmada
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch (_) {}

          if (modalInstance) {
            modalInstance.hide();
          } else if (modalEl) {
            modalEl.classList.remove('show');
            modalEl.style.display = 'none';
          }

          clearInterval(intervaloAutoguardado);
          window.HIS?.marcarFormularioLimpio?.();
          window.HIS?.anunciarCambio?.('Evolución médica firmada y sellada exitosamente.');
          mostrarMensaje('success', 'Evolución médica firmada y sellada exitosamente.');

          // Recargar la vista para reflejar el estado consolidado en la historia clínica
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } catch (err) {
          btnConfirmarFirma.disabled = false;
          btnConfirmarFirma.innerHTML = textoOriginal;

          if (modalInstance) {
            modalInstance.hide();
          } else if (modalEl) {
            modalEl.classList.remove('show');
            modalEl.style.display = 'none';
          }

          if (err.status === 409 || (err.datos && err.datos.codigo === 'CERRADA')) {
            mostrarMensaje(
              'danger',
              'La atención está cerrada; cualquier modificación posterior debe registrarse como adenda.'
            );
          } else if (
            err.status === 403 ||
            (err.datos && (err.datos.codigo === 'ROL_NO_PERMITIDO' || err.datos.codigo === 'ACCESO_DENEGADO'))
          ) {
            mostrarMensaje(
              'danger',
              'Acceso denegado: solo el médico titular de la atención puede firmar la evolución.'
            );
          } else if (err.status === 422) {
            mostrarMensaje(
              'warning',
              (err.datos && err.datos.mensaje) || 'Faltan campos requeridos para firmar la evolución.'
            );
          } else {
            mostrarMensaje('danger', err.message || 'Error inesperado al firmar y sellar la evolución médica.');
          }
        }
      });
    }

    // Exponer utilidad para testing o depuración
    window.HISCARE_EVOLUCION_SOAP = {
      guardarBorrador,
      activarTab,
      obtenerValores,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEvolucionSoap);
  } else {
    initEvolucionSoap();
  }
})();
