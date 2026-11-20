// public/js/cierre.js — Script cliente para Pantalla C.22 (Cierre inmutable con sello SHA-256 y adendas)
// Requisitos: HIS-F-22, HIS-D-02, HIS-E-07, EDT-RNF-05, HIS-NF-06

(function (global) {
  'use strict';

  /**
   * Sanitiza cadenas para prevenir XSS al renderizar texto dinámico en el DOM.
   */
  function escaparHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Sanitiza y protege mensajes de error contra fugas de SQL o stack traces (HIS-E-12).
   */
  function sanitizarMensajeError(mensaje) {
    let texto = String(mensaje || '').trim();
    if (!texto) {
      return 'Ocurrió un error en el procesamiento de la solicitud. Por favor verifique los requisitos o consulte al administrador.';
    }
    const upper = texto.toUpperCase();
    if (
      upper.includes('SELECT') ||
      upper.includes('INSERT') ||
      upper.includes('UPDATE') ||
      upper.includes('DELETE') ||
      upper.includes('PG_') ||
      upper.includes('AT EVAL') ||
      upper.includes('SYNTAX ERROR') ||
      upper.includes('VIOLATES') ||
      upper.includes('CONSTRAINT')
    ) {
      return 'Ocurrió un error en el procesamiento de la solicitud. Por favor verifique los requisitos o consulte al administrador.';
    }
    return texto;
  }

  /**
   * Abrevia la huella SHA-256 para presentación visual cuidada (ej. c...a71e4b0d3c58...e21).
   */
  function abreviarHuellaSha(hash) {
    if (!hash) return 'c...a71e4b0d3c58...e21';
    const str = String(hash).trim();
    if (str.length <= 20) return str;
    return `${str.slice(0, 1)}...${str.slice(1, 15)}...${str.slice(-3)}`;
  }

  /**
   * Valida la longitud y contenido del texto de una adenda clínica (HIS-D-02).
   */
  function validarTextoAdenda(texto) {
    const t = String(texto || '').trim();
    if (t.length < 10) {
      return { valido: false, error: 'La adenda debe contener al menos 10 caracteres explicativos.' };
    }
    if (t.length > 2000) {
      return { valido: false, error: 'La adenda no puede superar los 2000 caracteres.' };
    }
    return { valido: true, error: null };
  }

  /**
   * Inicializa la lógica interactiva del cierre de atención.
   */
  function initCierre() {
    if (typeof document === 'undefined') return;

    const contenedor = document.getElementById('contenedorCierre');
    if (!contenedor) return;

    const atencionId = contenedor.dataset.atencionId;
    const estadoInicial = contenedor.dataset.estado;
    const esCerrada = (estadoInicial === 'CERRADA');
    const esTitular = contenedor.dataset.esTitular === 'true';

    const contenedorAlertas = document.getElementById('contenedorAlertasCierre');

    // Elementos de la columna izquierda (Checklist)
    const badgeEstadoChecklist = document.getElementById('badgeEstadoChecklist');
    const btnCerrarAtencion = document.getElementById('btnCerrarAtencion');
    const modalConfirmarCierre = document.getElementById('modalConfirmarCierre');
    const btnConfirmarCerrar = document.getElementById('btnConfirmarCerrar');
    const spinnerModalCerrar = document.getElementById('spinnerModalCerrar');

    // Elementos del sello de atención
    const valorHuellaSha = document.getElementById('valorHuellaSha');
    const btnCopiarHuella = document.getElementById('btnCopiarHuella');
    const btnVerificarIntegridad = document.getElementById('btnVerificarIntegridad');
    const spinnerVerificar = document.getElementById('spinnerVerificar');
    const iconoVerificar = document.getElementById('iconoVerificar');
    const resultadoVerificacion = document.getElementById('resultadoVerificacion');

    // Elementos de la columna derecha (Adendas)
    const adendasBody = document.getElementById('adendasBody');
    const numAdendas = document.getElementById('numAdendas');
    const filaSinAdendas = document.getElementById('filaSinAdendas');
    const textoNuevaAdenda = document.getElementById('textoNuevaAdenda');
    const conteoCaracteresAdenda = document.getElementById('conteoCaracteresAdenda');
    const btnAgregarAdenda = document.getElementById('btnAgregarAdenda');
    const spinnerAdenda = document.getElementById('spinnerAdenda');

    // Íconos SVG reutilizables para checklist dinámico
    const svgCheck = `
      <svg width="18" height="18" fill="currentColor" class="bi bi-check-circle-fill text-success" viewBox="0 0 16 16">
        <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
      </svg>
    `;

    const svgX = `
      <svg width="18" height="18" fill="currentColor" class="bi bi-x-circle-fill text-danger" viewBox="0 0 16 16">
        <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/>
      </svg>
    `;

    /**
     * Muestra alertas amigables en la cabecera.
     */
    function mostrarAlerta(mensaje, tipo = 'info', autocloseMs = 6000) {
      if (!contenedorAlertas) return;

      const textoSeguro = sanitizarMensajeError(mensaje);
      const alertDiv = document.createElement('div');
      alertDiv.className = `alert alert-${tipo} alert-dismissible fade show shadow-sm border py-2 px-3 mb-3`;
      alertDiv.setAttribute('role', 'alert');

      const flexDiv = document.createElement('div');
      flexDiv.className = 'd-flex align-items-center gap-2';
      const span = document.createElement('span');
      span.textContent = textoSeguro;
      flexDiv.appendChild(span);

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
     * Consulta y actualiza el checklist de cierre dinámicamente si la atención está ABIERTA.
     */
    async function consultarChecklist() {
      if (esCerrada) return;

      try {
        const resp = await fetch(`/api/atenciones/${atencionId}/validar-cierre`);
        if (!resp.ok) return;

        const data = await resp.json();
        if (!data.ok || !Array.isArray(data.data)) return;

        const reglas = data.data;
        const puedeCerrar = Boolean(data.puedeCerrar);

        // Actualizar badge general del checklist
        if (badgeEstadoChecklist) {
          if (puedeCerrar) {
            badgeEstadoChecklist.className = 'badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 small';
            badgeEstadoChecklist.textContent = 'Requisitos completos';
          } else {
            badgeEstadoChecklist.className = 'badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 small';
            badgeEstadoChecklist.textContent = 'Requisitos pendientes';
          }
        }

        // Actualizar cada regla
        reglas.forEach((r) => {
          let iconoEl = null;
          if (r.regla === 'motivo_signos') iconoEl = document.getElementById('iconoMotivo');
          else if (r.regla === 'evolucion_medica') iconoEl = document.getElementById('iconoEvolucion');
          else if (r.regla === 'diagnostico_principal') {
            iconoEl = document.getElementById('iconoDiagnostico');
            if (r.codigo) {
              let badgeDiag = document.getElementById('badgeDiagChecklist');
              if (!badgeDiag) {
                const itemDiag = document.getElementById('itemChecklistDiagnostico');
                const spanTexto = itemDiag ? itemDiag.querySelector('span.small') : null;
                if (spanTexto) {
                  badgeDiag = document.createElement('span');
                  badgeDiag.id = 'badgeDiagChecklist';
                  badgeDiag.className = 'badge bg-light text-primary font-monospace ms-1 border';
                  spanTexto.appendChild(badgeDiag);
                }
              }
              if (badgeDiag) {
                badgeDiag.textContent = `(${r.codigo})`;
              }
            }
          } else if (r.regla === 'consentimientos_firmados') iconoEl = document.getElementById('iconoConsentimientos');
          else if (r.regla === 'nota_alta') iconoEl = document.getElementById('iconoNotaAlta');

          if (iconoEl) {
            iconoEl.innerHTML = r.cumple ? svgCheck : svgX;
          }
        });

        // Actualizar estado del botón cerrar
        if (btnCerrarAtencion) {
          btnCerrarAtencion.disabled = !(puedeCerrar && esTitular);
        }
      } catch (err) {
        console.warn('No se pudo actualizar el checklist en tiempo real:', err);
      }
    }

    /**
     * Manejo del cierre definitivo de la atención médica
     */
    if (btnCerrarAtencion) {
      btnCerrarAtencion.addEventListener('click', () => {
        if (btnCerrarAtencion.disabled) return;
        if (modalConfirmarCierre && typeof bootstrap !== 'undefined') {
          const bsModal = bootstrap.Modal.getInstance(modalConfirmarCierre) || new bootstrap.Modal(modalConfirmarCierre);
          bsModal.show();
        }
      });
    }

    if (btnConfirmarCerrar) {
      btnConfirmarCerrar.addEventListener('click', async () => {
        btnConfirmarCerrar.disabled = true;
        if (spinnerModalCerrar) spinnerModalCerrar.classList.remove('d-none');

        try {
          const resp = await fetch(`/api/atenciones/${atencionId}/cerrar`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          const data = await resp.json();

          if (resp.ok && data.ok) {
            // Ocultar modal si está abierto
            if (modalConfirmarCierre && typeof bootstrap !== 'undefined') {
              const bsModal = bootstrap.Modal.getInstance(modalConfirmarCierre);
              if (bsModal) bsModal.hide();
            }

            global.HIS?.marcarFormularioLimpio?.();
            global.HIS?.anunciarCambio?.('Atención clínica cerrada con sello criptográfico SHA-256.');
            mostrarAlerta('Atención sellada con éxito. Aplicando sello criptográfico SHA-256...', 'success');

            // Recargar página para mostrar todos los componentes sellados y adendas
            setTimeout(() => {
              window.location.reload();
            }, 600);
          } else {
            const mensajeError = (data.error && data.error.mensaje) || 'No fue posible cerrar la atención clínica.';
            mostrarAlerta(mensajeError, 'danger', 8000);
            btnConfirmarCerrar.disabled = false;
            if (spinnerModalCerrar) spinnerModalCerrar.classList.add('d-none');
          }
        } catch (err) {
          mostrarAlerta('Error de comunicación con el servidor al cerrar la atención.', 'danger');
          btnConfirmarCerrar.disabled = false;
          if (spinnerModalCerrar) spinnerModalCerrar.classList.add('d-none');
        }
      });
    }

    /**
     * Manejo de verificación de integridad criptográfica (SHA-256)
     */
    if (btnVerificarIntegridad) {
      btnVerificarIntegridad.addEventListener('click', async () => {
        btnVerificarIntegridad.disabled = true;
        if (spinnerVerificar) spinnerVerificar.classList.remove('d-none');
        if (iconoVerificar) iconoVerificar.classList.add('d-none');
        if (resultadoVerificacion) resultadoVerificacion.innerHTML = '';

        try {
          const resp = await fetch(`/api/atenciones/${atencionId}/verificar-firma`);
          const data = await resp.json();

          if (resp.ok && data.ok && data.data && data.data.valida) {
            if (resultadoVerificacion) {
              resultadoVerificacion.innerHTML = `
                <div class="alert alert-success border border-success-subtle py-2 px-3 small d-flex align-items-center gap-2 mb-0 shadow-sm" role="alert">
                  <svg width="20" height="20" fill="currentColor" class="bi bi-shield-check text-success flex-shrink-0" viewBox="0 0 16 16">
                    <path d="M5.338 1.59a61.44 61.44 0 0 0-2.837.856.481.481 0 0 0-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.725 10.725 0 0 0 2.287 2.233c.346.244.652.42.893.533.12.057.218.095.293.118a.55.55 0 0 0 .101.025.615.615 0 0 0 .1-.025c.076-.023.174-.061.294-.118.24-.113.547-.29.893-.533a10.726 10.726 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067c-.53 0-1.552.223-2.662.524zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.464 9.99a11.775 11.775 0 0 1-2.517 2.453 7.159 7.159 0 0 1-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7.158 7.158 0 0 1-1.048-.625 11.777 11.777 0 0 1-2.517-2.453C1.928 10.487.545 7.169 1.141 2.692A1.54 1.54 0 0 1 2.185 1.43 62.456 62.456 0 0 1 5.072.56z"/>
                    <path d="M10.854 5.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 7.793l2.646-2.647a.5.5 0 0 1 .708 0z"/>
                  </svg>
                  <div>
                    <div class="fw-bold">Firma criptográfica íntegra y válida.</div>
                    <div class="small">El registro no ha sufrido alteraciones. Verificado conforme a SHA-256.</div>
                  </div>
                </div>
              `;
            }
          } else {
            if (resultadoVerificacion) {
              resultadoVerificacion.innerHTML = `
                <div class="alert alert-danger border border-danger-subtle py-2 px-3 small d-flex align-items-center gap-2 mb-0 shadow-sm" role="alert">
                  <svg width="20" height="20" fill="currentColor" class="bi bi-shield-slash text-danger flex-shrink-0" viewBox="0 0 16 16">
                    <path d="M1.088.708a.5.5 0 0 0-.708.708l14.25 14.25a.5.5 0 0 0 .708-.708l-1.1-1.1a11.777 11.777 0 0 0 2.518-2.453C14.072 10.487 15.455 7.169 14.859 2.692A1.54 1.54 0 0 0 13.815 1.43 62.456 62.456 0 0 0 10.928.56C9.843.265 8.689 0 8 0c-.53 0-1.552.223-2.662.524-.486.132-.976.28-1.46.444L1.088.708z"/>
                  </svg>
                  <div>
                    <div class="fw-bold">Discrepancia en la firma criptográfica.</div>
                    <div class="small">El contenido de la atención difiere del hash almacenado al cierre.</div>
                  </div>
                </div>
              `;
            }
          }
        } catch (err) {
          mostrarAlerta('No fue posible verificar la firma criptográfica en este momento.', 'warning');
        } finally {
          btnVerificarIntegridad.disabled = false;
          if (spinnerVerificar) spinnerVerificar.classList.add('d-none');
          if (iconoVerificar) iconoVerificar.classList.remove('d-none');
        }
      });
    }

    // Copiar huella completa al portapapeles
    if (btnCopiarHuella && valorHuellaSha) {
      btnCopiarHuella.addEventListener('click', () => {
        const huellaCompleta = valorHuellaSha.getAttribute('title') || '';
        if (!huellaCompleta) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(huellaCompleta).then(() => {
            mostrarAlerta('Huella SHA-256 copiada al portapapeles.', 'info', 3000);
          }).catch(() => {
            mostrarAlerta('No se pudo copiar la huella automáticamente.', 'warning', 3000);
          });
        }
      });
    }

    // Inicializar tooltips de Bootstrap si están disponibles
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
      const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.forEach((el) => new bootstrap.Tooltip(el));
    }

    /**
     * Manejo del formulario de adendas (Atención CERRADA)
     */
    if (textoNuevaAdenda && conteoCaracteresAdenda) {
      const actualizarContador = () => {
        const len = textoNuevaAdenda.value.trim().length;
        conteoCaracteresAdenda.textContent = len;
        if (len >= 10 && len <= 2000) {
          conteoCaracteresAdenda.className = 'text-success fw-bold';
        } else {
          conteoCaracteresAdenda.className = 'text-danger fw-bold';
        }
      };

      textoNuevaAdenda.addEventListener('input', () => {
        actualizarContador();
        global.HIS?.marcarFormularioSucio?.();
      });
      textoNuevaAdenda.addEventListener('change', () => {
        actualizarContador();
        global.HIS?.marcarFormularioSucio?.();
      });
    }

    if (btnAgregarAdenda && textoNuevaAdenda) {
      btnAgregarAdenda.addEventListener('click', async () => {
        const texto = textoNuevaAdenda.value.trim();
        const validacion = validarTextoAdenda(texto);

        if (!validacion.valido) {
          mostrarAlerta(validacion.error, 'warning');
          textoNuevaAdenda.focus();
          return;
        }

        btnAgregarAdenda.disabled = true;
        if (spinnerAdenda) spinnerAdenda.classList.remove('d-none');

        try {
          const resp = await fetch(`/api/atenciones/${atencionId}/adendas`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ texto }),
          });

          const data = await resp.json();

          if (resp.status === 201 && data.ok && data.data) {
            const adenda = data.data;

            // Si había fila de "Sin adendas", eliminarla
            if (filaSinAdendas) {
              filaSinAdendas.remove();
            }

            // Crear nueva fila en la tabla de adendas [22.43]
            const tr = document.createElement('tr');
            tr.className = 'table-success bg-opacity-25';
            tr.style.transition = 'background-color 1.5s ease';
            tr.innerHTML = `
              <td class="small font-monospace text-nowrap">${escaparHtml(adenda.fecha_formateada || adenda.fecha)}</td>
              <td class="small fw-semibold text-nowrap">${escaparHtml(adenda.autor_nombre || 'Médico tratante')}</td>
              <td class="small text-break">${escaparHtml(adenda.texto)}</td>
            `;

            if (adendasBody) {
              adendasBody.appendChild(tr);
            }

            // Desvanecer color de éxito suavemente
            setTimeout(() => {
              tr.classList.remove('table-success', 'bg-opacity-25');
            }, 1500);

            // Actualizar contador visual
            if (numAdendas) {
              const actual = parseInt(numAdendas.textContent, 10) || 0;
              numAdendas.textContent = actual + 1;
            }

            // Limpiar input y reiniciar contador
            textoNuevaAdenda.value = '';
            if (conteoCaracteresAdenda) {
              conteoCaracteresAdenda.textContent = '0';
              conteoCaracteresAdenda.className = 'text-danger fw-bold';
            }

            global.HIS?.marcarFormularioLimpio?.();
            global.HIS?.anunciarCambio?.('Adenda clínica registrada y agregada a la tabla.');
            mostrarAlerta('Adenda registrada exitosamente como registro inmutable.', 'success');
          } else {
            const msg = (data.error && data.error.mensaje) || 'No fue posible registrar la adenda.';
            mostrarAlerta(msg, 'danger');
          }
        } catch (err) {
          mostrarAlerta('Error de red al intentar registrar la adenda.', 'danger');
        } finally {
          btnAgregarAdenda.disabled = false;
          if (spinnerAdenda) spinnerAdenda.classList.add('d-none');
        }
      });
    }

    // Ejecución inicial al cargar
    if (!esCerrada) {
      consultarChecklist();
    }
  }

  // Ejecución en carga del DOM
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCierre);
    } else {
      initCierre();
    }
  }

  // Exponer API pública en navegador y en Node.js
  const apiPublica = {
    escaparHtml,
    sanitizarMensajeError,
    abreviarHuellaSha,
    validarTextoAdenda,
    initCierre,
  };

  if (typeof window !== 'undefined') {
    window.HISCARE_CIERRE = apiPublica;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = apiPublica;
  }

})(typeof window !== 'undefined' ? window : globalThis);
