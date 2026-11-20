// public/js/paciente_detalle.js — Lógica de cliente para la Pantalla C.15 (Ficha única del paciente)
(function () {
  'use strict';

  /**
   * Escapa caracteres HTML para prevenir inyección XSS al manipular el DOM.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Formatea una fecha en formato legible DD/MM/AAAA.
   * @param {string|Date} fechaStr
   * @returns {string}
   */
  function formatearFecha(fechaStr) {
    if (!fechaStr) return '—';
    if (typeof fechaStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fechaStr)) {
      const partes = fechaStr.substring(0, 10).split('-');
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return String(fechaStr);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
  }

  /**
   * Valida sintaxis básica de teléfono (celular colombiano o teléfono fijo/internacional).
   * @param {string} tel
   * @returns {boolean}
   */
  function validarTelefono(tel) {
    if (!tel || typeof tel !== 'string') return false;
    const limpio = tel.trim().replace(/[\s\-\(\)]/g, '');
    // Celular colombiano con o sin prefijo (+57) o número telefónico de 7 a 15 dígitos
    return /^(\+?57)?(3\d{9}|[1-9]\d{6,9})$/.test(limpio) || /^\+?[0-9]{7,15}$/.test(limpio);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const contenedor = document.getElementById('fichaPacienteContainer');
    const pacienteId = contenedor ? (contenedor.dataset.pacienteId || '').trim() : '';

    // Elementos de alertas
    const alertaDuplicado = document.getElementById('alertaDuplicado');
    const alertaDuplicadoCliente = document.getElementById('alertaDuplicadoCliente');
    const alertaRecienGuardado = document.getElementById('alertaRecienGuardado');
    const bannerRecienGuardadoCliente = document.getElementById('bannerRecienGuardadoCliente');

    // Detección de parámetros URL para banners reactivos (duplicado y guardado)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const esDuplicado = urlParams.get('duplicado') === 'true' || urlParams.get('duplicado') === '1';
      const esRecienGuardado = urlParams.get('recienGuardado') === 'true' || urlParams.get('guardado') === '1' || urlParams.get('guardado') === 'true';

      if (esDuplicado && !alertaDuplicado && alertaDuplicadoCliente) {
        alertaDuplicadoCliente.classList.remove('d-none');
        alertaDuplicadoCliente.classList.add('d-flex');
      }

      if (esRecienGuardado && !alertaRecienGuardado && bannerRecienGuardadoCliente) {
        bannerRecienGuardadoCliente.classList.remove('d-none');
        bannerRecienGuardadoCliente.classList.add('d-flex');
      }
    } catch (e) {
      // Ignorar fallas al parsear URL
    }

    // Elementos de la tabla de contactos
    const tbodyContactos = document.getElementById('tbodyContactos');
    const emptyContactos = document.getElementById('emptyContactos');
    const badgeTotalContactos = document.getElementById('badgeTotalContactos');

    // Elementos del modal y formulario de contacto
    const modalEl = document.getElementById('modalNuevoContacto');
    const formContacto = document.getElementById('formNuevoContacto');
    const nombreInput = document.getElementById('contactoNombre');
    const parentescoSelect = document.getElementById('contactoParentesco');
    const telInput = document.getElementById('contactoTelefono');
    const alertaModal = document.getElementById('alertaModalContacto');
    const btnGuardarContacto = document.getElementById('btnGuardarContacto');
    const spinnerContacto = document.getElementById('spinnerContacto');
    const textoBtnGuardar = document.getElementById('textoBtnGuardarContacto');

    /**
     * Despliega un mensaje de error o aviso en el modal.
     * @param {'danger'|'warning'|'info'|'success'} tipo
     * @param {string} mensaje
     */
    function mostrarAlertaModal(tipo, mensaje) {
      if (!alertaModal) return;
      alertaModal.className = `alert alert-${tipo} py-2 px-3 small mb-3`;
      alertaModal.innerHTML = '';
      if (Array.isArray(mensaje)) {
        mensaje.forEach((linea, idx) => {
          if (idx > 0) alertaModal.appendChild(document.createElement('br'));
          alertaModal.appendChild(document.createTextNode(String(linea)));
        });
      } else {
        alertaModal.textContent = String(mensaje || '');
      }
      alertaModal.classList.remove('d-none');
    }

    /**
     * Oculta el mensaje de alerta del modal.
     */
    function limpiarAlertaModal() {
      if (!alertaModal) return;
      alertaModal.className = 'alert d-none py-2 px-3 small mb-3';
      alertaModal.textContent = '';
    }

    /**
     * Agrega dinámicamente un contacto nuevo a la tabla de contactos.
     * @param {object} c - { id, nombre, parentesco, telefono }
     */
    function agregarFilaContacto(c) {
      if (!tbodyContactos) return;
      const tr = document.createElement('tr');
      if (c.id) tr.dataset.contactoId = c.id;

      tr.innerHTML = `
        <td class="fw-semibold text-dark">${escapeHtml(c.nombre)}</td>
        <td>
          <span class="badge bg-secondary-subtle text-secondary-emphasis">
            ${escapeHtml(c.parentesco || 'Familiar')}
          </span>
        </td>
        <td>
          <a href="tel:${encodeURIComponent(c.telefono || '')}" class="text-decoration-none text-primary fw-medium font-monospace">
            ${escapeHtml(c.telefono || '—')}
          </a>
        </td>
      `;

      tbodyContactos.appendChild(tr);

      if (emptyContactos) {
        emptyContactos.classList.add('d-none');
      }

      if (badgeTotalContactos) {
        const total = tbodyContactos.querySelectorAll('tr').length;
        badgeTotalContactos.textContent = `${total} registrado${total === 1 ? '' : 's'}`;
      }
    }

    // Limpiar validaciones al escribir en los inputs
    if (nombreInput) {
      nombreInput.addEventListener('input', () => {
        nombreInput.classList.remove('is-invalid');
        limpiarAlertaModal();
      });
    }
    if (telInput) {
      telInput.addEventListener('input', () => {
        telInput.classList.remove('is-invalid');
        limpiarAlertaModal();
      });
    }

    // Limpiar formulario al abrir o cerrar modal
    if (modalEl) {
      modalEl.addEventListener('show.bs.modal', () => {
        if (formContacto) formContacto.reset();
        limpiarAlertaModal();
        if (nombreInput) nombreInput.classList.remove('is-invalid');
        if (telInput) telInput.classList.remove('is-invalid');
      });
    }

    // Manejo de envío del formulario de nuevo contacto
    if (formContacto && pacienteId) {
      formContacto.addEventListener('submit', async (e) => {
        e.preventDefault();
        limpiarAlertaModal();

        const nombreVal = nombreInput ? nombreInput.value.trim() : '';
        const parentescoVal = parentescoSelect ? parentescoSelect.value.trim() : 'Familiar';
        const telVal = telInput ? telInput.value.trim() : '';

        let esValido = true;

        if (!nombreVal) {
          if (nombreInput) nombreInput.classList.add('is-invalid');
          esValido = false;
        }

        if (!telVal || !validarTelefono(telVal)) {
          if (telInput) telInput.classList.add('is-invalid');
          esValido = false;
        }

        if (!esValido) {
          mostrarAlertaModal('warning', 'Por favor complete los campos obligatorios con un formato válido.');
          return;
        }

        // Estado de carga
        if (btnGuardarContacto) btnGuardarContacto.disabled = true;
        if (spinnerContacto) spinnerContacto.classList.remove('d-none');
        if (textoBtnGuardar) textoBtnGuardar.textContent = 'Guardando...';

        try {
          const res = await fetch(`/api/pacientes/${encodeURIComponent(pacienteId)}/contactos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({
              nombre: nombreVal,
              parentesco: parentescoVal,
              telefono: telVal,
            }),
          });

          const datos = await res.json().catch(() => ({}));

          if (res.status === 201) {
            // 201: Contacto creado exitosamente
            const nuevoContacto = (datos && datos.data) ? datos.data : {
              nombre: nombreVal,
              parentesco: parentescoVal,
              telefono: telVal,
            };

            agregarFilaContacto(nuevoContacto);

            // Cerrar el modal con Bootstrap
            if (typeof bootstrap !== 'undefined' && bootstrap.Modal && modalEl) {
              const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
              modalInstance.hide();
            }

            formContacto.reset();
            window.HIS?.marcarFormularioLimpio?.(formContacto);
            window.HIS?.anunciarCambio?.('Contacto de emergencia agregado a la tabla.');

            // Notificación global o toast
            if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
              window.HIS.mostrarMensaje('success', 'Contacto de emergencia agregado exitosamente.');
            }
          } else if (res.status === 422) {
            // 422: Error de validación
            let errorMsg = (datos.error && datos.error.mensaje) || 'Uno o más datos ingresados no son válidos.';
            if (datos.error && Array.isArray(datos.error.campos) && datos.error.campos.length > 0) {
              const detalles = datos.error.campos.map((c) => {
                if (typeof c === 'string') return c;
                return c.msg || c.mensaje || c.path || '';
              }).filter(Boolean);
              if (detalles.length > 0) {
                errorMsg = detalles;
              }
            }
            mostrarAlertaModal('warning', errorMsg);
          } else if (res.status === 403) {
            // 403: Permisos insuficientes
            mostrarAlertaModal('danger', 'No tiene permisos suficientes para registrar contactos de emergencia.');
          } else if (res.status === 401) {
            // 401: Sesión expirada
            location.href = '/auth/sesion-expirada?next=' + encodeURIComponent(location.pathname + location.search);
          } else {
            // Otros errores HTTP (409, 500, etc.)
            const msg = (datos.error && datos.error.mensaje) || 'No fue posible registrar el contacto de emergencia. Inténtelo más tarde.';
            mostrarAlertaModal('danger', msg);
          }
        } catch (err) {
          mostrarAlertaModal('danger', 'Error de red o comunicación con el servidor. Verifique su conexión.');
        } finally {
          if (btnGuardarContacto) btnGuardarContacto.disabled = false;
          if (spinnerContacto) spinnerContacto.classList.add('d-none');
          if (textoBtnGuardar) textoBtnGuardar.textContent = 'Guardar contacto';
        }
      });
    }

    // =========================================================================
    // Carga asíncrona de últimos movimientos si la tabla vino vacía del servidor
    // =========================================================================
    const tbodyMovimientos = document.getElementById('tbodyMovimientos');
    const emptyMovimientos = document.getElementById('emptyMovimientos');

    if (pacienteId && tbodyMovimientos && tbodyMovimientos.children.length === 0) {
      (async function cargarMovimientos() {
        try {
          const res = await fetch(`/api/pacientes/${encodeURIComponent(pacienteId)}/movimientos`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
          });

          if (!res.ok) return;

          const json = await res.json().catch(() => ({}));
          const lista = Array.isArray(json) ? json : (json.data || []);

          if (Array.isArray(lista) && lista.length > 0) {
            tbodyMovimientos.innerHTML = '';
            lista.forEach((m) => {
              const tr = document.createElement('tr');
              tr.innerHTML = `
                <td class="small text-muted font-monospace">${escapeHtml(formatearFecha(m.fecha))}</td>
                <td class="fw-semibold small text-dark">${escapeHtml(m.descripcion || m.tipo || m.evento || 'Evento')}</td>
                <td class="font-monospace small">
                  <span class="badge bg-light text-secondary border">${escapeHtml(m.codigo || m.id || m.estado || '—')}</span>
                </td>
              `;
              tbodyMovimientos.appendChild(tr);
            });

            if (emptyMovimientos) {
              emptyMovimientos.classList.add('d-none');
            }
            window.HIS?.anunciarCambio?.(`Últimos ${lista.length} movimientos clínicos cargados.`);
          }
        } catch (e) {
          // No interrumpir si el endpoint no está disponible
        }
      })();
    }
  });
})();
