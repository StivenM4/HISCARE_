// public/js/antecedentes.js — Gestión cliente de la pestaña Antecedentes (C.5)
(function () {
  'use strict';

  function initAntecedentes() {
    const container = document.getElementById('antecedentesContainer');
    if (!container) return;

    const modalEl = document.getElementById('modalAgregarAntecedente');
    const formEl = document.getElementById('formAgregarAntecedente');
    const inputTipo = document.getElementById('modalAntecedenteTipoInput');
    const badgeTipo = document.getElementById('modalAntecedenteTipoBadge');
    const textareaDesc = document.getElementById('modalAntecedenteDescripcion');
    const contador = document.getElementById('caracteresActuales');
    const feedbackDesc = document.getElementById('modalAntecedenteDescripcionFeedback');
    const errorBox = document.getElementById('modalAntecedenteError');
    const errorTexto = document.getElementById('modalAntecedenteErrorTexto');
    const btnGuardar = document.getElementById('btnGuardarAntecedente');
    const spinner = document.getElementById('spinnerGuardarAntecedente');

    let modalInstance = null;
    if (modalEl && window.bootstrap && window.bootstrap.Modal) {
      modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    }

    function mostrarErrorModal(mensaje) {
      if (errorBox && errorTexto) {
        errorTexto.textContent = mensaje;
        errorBox.classList.remove('d-none');
      } else if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
        window.HIS.mostrarMensaje('danger', mensaje);
      } else if (typeof alert === 'function') {
        alert(mensaje);
      }
    }

    function ocultarErrorModal() {
      if (errorBox && errorTexto) {
        errorTexto.textContent = '';
        errorBox.classList.add('d-none');
      }
      if (textareaDesc) {
        textareaDesc.classList.remove('is-invalid');
      }
      if (feedbackDesc) {
        feedbackDesc.classList.add('d-none');
      }
    }

    function parsearAntecedenteAlergico(desc) {
      if (!desc) return { sustancia: '', reaccion: '', anio: '', tieneFormato: false };
      const raw = String(desc).trim();
      const sepMatch = raw.match(/\s*[-–—]\s*/);
      if (!sepMatch) {
        return { sustancia: raw, reaccion: '', anio: '', tieneFormato: false };
      }
      const sustancia = raw.substring(0, sepMatch.index).trim();
      const resto = raw.substring(sepMatch.index + sepMatch[0].length).trim();
      const anioMatch = resto.match(/\s*\(([^)]+)\)$/);
      let reaccion = resto;
      let anio = '';
      if (anioMatch) {
        anio = anioMatch[1].trim();
        reaccion = resto.substring(0, anioMatch.index).trim();
      }
      return { sustancia, reaccion, anio, tieneFormato: Boolean(reaccion) };
    }

    function abrirModal(tipo, label) {
      ocultarErrorModal();
      if (inputTipo) inputTipo.value = tipo;
      if (badgeTipo) {
        badgeTipo.textContent = label || tipo;
        if (tipo === 'Alergico') {
          badgeTipo.className = 'badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-3 py-2 fs-6 fw-medium';
        } else {
          badgeTipo.className = 'badge bg-light text-primary border border-primary-subtle px-3 py-2 fs-6 fw-medium';
        }
      }
      if (textareaDesc) {
        textareaDesc.value = '';
        textareaDesc.classList.remove('is-invalid');
      }
      if (contador) contador.textContent = '0';

      // Mostrar sugerencias clínicas rápidas según el tipo
      const contenedoresSugerencias = document.querySelectorAll('#modalSugerenciasContainer > div');
      contenedoresSugerencias.forEach((div) => {
        if (div && div.classList && typeof div.classList.add === 'function') {
          div.classList.add('d-none');
        }
      });
      const sugerenciaActual = document.getElementById('sugerencias' + tipo);
      if (sugerenciaActual && sugerenciaActual.classList && typeof sugerenciaActual.classList.remove === 'function') {
        sugerenciaActual.classList.remove('d-none');
      }

      if (modalInstance) {
        modalInstance.show();
      } else if (modalEl && window.bootstrap && window.bootstrap.Modal) {
        modalInstance = new window.bootstrap.Modal(modalEl);
        modalInstance.show();
      } else if (modalEl) {
        modalEl.classList.add('show');
        modalEl.style.display = 'block';
        document.body.classList.add('modal-open');
      }

      setTimeout(() => {
        if (textareaDesc) textareaDesc.focus();
      }, 350);
    }

    function cerrarModal() {
      if (modalInstance) {
        modalInstance.hide();
      } else if (modalEl) {
        modalEl.classList.remove('show');
        modalEl.style.display = 'none';
        document.body.classList.remove('modal-open');
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
      }
    }

    function escaparHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Configurar apertura del modal desde los botones de agregar
    const botonesAgregar = document.querySelectorAll('.btn-agregar-antecedente');
    botonesAgregar.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tipo = btn.dataset.tipo || btn.getAttribute('data-tipo');
        const label = btn.dataset.tipoLabel || btn.getAttribute('data-tipo-label') || tipo;
        abrirModal(tipo, label);
      });
    });

    // Chips de sugerencia rápida para autocompletar la descripción
    const chipsSugerencias = document.querySelectorAll('.chip-sugerencia');
    chipsSugerencias.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const plantilla = chip.dataset.plantilla || chip.getAttribute('data-plantilla');
        if (plantilla && textareaDesc) {
          textareaDesc.value = plantilla;
          if (contador) contador.textContent = String(plantilla.length);
          textareaDesc.classList.remove('is-invalid');
          if (feedbackDesc) feedbackDesc.classList.add('d-none');
          if (errorBox) errorBox.classList.add('d-none');
          textareaDesc.focus();
          if (typeof textareaDesc.setSelectionRange === 'function') {
            textareaDesc.setSelectionRange(plantilla.length, plantilla.length);
          }
        }
      });
    });

    // Contador de caracteres en tiempo real
    if (textareaDesc && contador) {
      textareaDesc.addEventListener('input', () => {
        const len = textareaDesc.value.length;
        contador.textContent = String(len);
        if (len >= 3 && len <= 1000) {
          textareaDesc.classList.remove('is-invalid');
          if (feedbackDesc) feedbackDesc.classList.add('d-none');
          if (errorBox) errorBox.classList.add('d-none');
        }
      });
    }

    // Envío del formulario
    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        ocultarErrorModal();

        const tipo = inputTipo ? inputTipo.value.trim() : '';
        const descripcion = textareaDesc ? textareaDesc.value.trim() : '';

        // Validación cliente
        if (!tipo) {
          mostrarErrorModal('Debe especificar un tipo de antecedente válido.');
          return;
        }

        if (descripcion.length < 3 || descripcion.length > 1000) {
          if (textareaDesc) textareaDesc.classList.add('is-invalid');
          if (feedbackDesc) feedbackDesc.classList.remove('d-none');
          mostrarErrorModal('La descripción debe tener entre 3 y 1000 caracteres.');
          if (textareaDesc) textareaDesc.focus();
          return;
        }

        const historiaId = container.dataset.historia;
        if (!historiaId) {
          mostrarErrorModal('No se encontró el identificador de la historia clínica.');
          return;
        }

        // Estado cargando
        if (btnGuardar) btnGuardar.disabled = true;
        if (spinner) spinner.classList.remove('d-none');

        try {
          const resp = await fetch('/api/historias/' + encodeURIComponent(historiaId) + '/antecedentes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ tipo, descripcion })
          });

          if (resp.status === 201 || (resp.ok && resp.status === 200)) {
            // Inserción en la tarjeta correspondiente
            const lista = document.getElementById('lista-' + tipo);
            if (lista) {
              // Remover elemento de "Sin antecedentes registrados"
              const sinReg = lista.querySelector('.sin-antecedentes');
              if (sinReg) sinReg.remove();

              const ahora = new Date();
              const dia = String(ahora.getDate()).padStart(2, '0');
              const mes = String(ahora.getMonth() + 1).padStart(2, '0');
              const anio = ahora.getFullYear();
              const fechaTexto = `${dia}/${mes}/${anio}`;

              const nuevoLi = document.createElement('li');
              if (tipo === 'Alergico') {
                nuevoLi.className = 'mb-2 p-2 rounded bg-danger bg-opacity-10 border border-danger border-opacity-25 d-flex align-items-start gap-2 shadow-sm';
                const infoAl = parsearAntecedenteAlergico(descripcion);
                let detalleHtml = '';
                if (infoAl.tieneFormato) {
                  const anioBadge = infoAl.anio
                    ? `<span class="badge bg-white text-danger border border-danger border-opacity-25 small ms-auto fw-medium">(${escaparHtml(infoAl.anio)})</span>`
                    : `<span class="text-muted small ms-auto">(${fechaTexto})</span>`;
                  detalleHtml = `
                    <div class="d-flex flex-wrap align-items-center gap-1">
                      <span class="badge bg-danger text-white fw-bold text-uppercase py-1 px-2" style="font-size: 0.75rem;">${escaparHtml(infoAl.sustancia)}</span>
                      <span class="text-danger fw-semibold small">•</span>
                      <span class="text-dark fw-medium">${escaparHtml(infoAl.reaccion)}</span>
                      ${anioBadge}
                    </div>
                  `;
                } else {
                  detalleHtml = `
                    <div class="d-flex flex-wrap align-items-center gap-1">
                      <strong class="text-danger fw-bold text-uppercase">${escaparHtml(infoAl.sustancia)}</strong>
                      <span class="text-muted small ms-auto">(${fechaTexto})</span>
                    </div>
                  `;
                }
                nuevoLi.innerHTML = `
                  <svg width="15" height="15" fill="currentColor" class="bi bi-exclamation-octagon-fill text-danger flex-shrink-0 mt-1" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M11.46.146A.5.5 0 0 0 11.107 0H4.893a.5.5 0 0 0-.353.146L.146 4.54A.5.5 0 0 0 0 4.893v6.214a.5.5 0 0 0 .146.353l4.394 4.394a.5.5 0 0 0 .353.146h6.214a.5.5 0 0 0 .353-.146l4.394-4.394a.5.5 0 0 0 .146-.353V4.893a.5.5 0 0 0-.146-.353L11.46.146zM8 4c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
                  </svg>
                  <div class="w-100">
                    ${detalleHtml}
                    <span class="d-none raw-descripcion">${escaparHtml(descripcion)}</span>
                  </div>
                `;
              } else {
                const dotClass = 'text-primary';
                nuevoLi.className = 'mb-2 d-flex align-items-start gap-2';
                nuevoLi.innerHTML = `
                  <span class="${dotClass} mt-1">•</span>
                  <div>
                    <span class="fw-medium text-dark">${escaparHtml(descripcion)}</span>
                    <span class="text-muted small ms-1">(${fechaTexto})</span>
                  </div>
                `;
              }
              lista.appendChild(nuevoLi);
            }

            // Actualización inmediata del banner del paciente si es Alérgico (Criterio de aceptación 1)
            if (tipo === 'Alergico') {
              const bannerAlergias = document.getElementById('bannerAlergias');
              const nuevaAlergiaUpper = descripcion.trim().toUpperCase();
              const normalizar = (s) => s.replace(/\s+/g, ' ').replace(/[–—]/g, '-').trim().toUpperCase();
              const nuevaNorm = normalizar(nuevaAlergiaUpper);

              if (bannerAlergias) {
                const textoExistente = bannerAlergias.textContent.replace(/^ALERGIA:\s*/i, '').trim();
                const itemsAlergias = textoExistente ? textoExistente.split(' · ') : [];
                const yaExiste = itemsAlergias.some((it) => normalizar(it) === nuevaNorm);
                if (!yaExiste) {
                  itemsAlergias.push(nuevaAlergiaUpper);
                }
                const textoCompleto = `ALERGIA: ${itemsAlergias.join(' · ')}`;
                bannerAlergias.textContent = textoCompleto;
                bannerAlergias.setAttribute('title', textoCompleto);
                if (bannerAlergias.classList) {
                  bannerAlergias.classList.remove('alert-pulse');
                  bannerAlergias.classList.add('alert-pulse');
                }

                if (typeof document.createElementNS === 'function' && typeof bannerAlergias.prepend === 'function' && !bannerAlergias.querySelector('svg')) {
                  const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                  svgIcon.setAttribute('width', '13');
                  svgIcon.setAttribute('height', '13');
                  svgIcon.setAttribute('fill', 'currentColor');
                  svgIcon.setAttribute('class', 'bi bi-exclamation-triangle-fill flex-shrink-0');
                  svgIcon.setAttribute('viewBox', '0 0 16 16');
                  svgIcon.setAttribute('aria-hidden', 'true');
                  svgIcon.innerHTML = '<path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>';
                  bannerAlergias.prepend(svgIcon);
                }
              } else {
                const bannerPaciente = document.getElementById('bannerPaciente');
                if (bannerPaciente) {
                  const nuevoBadge = document.createElement('span');
                  nuevoBadge.id = 'bannerAlergias';
                  nuevoBadge.className = 'badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2 py-1 fw-bold text-uppercase d-inline-flex align-items-center gap-1 text-truncate alert-pulse';
                  nuevoBadge.setAttribute('title', `ALERGIA: ${nuevaAlergiaUpper}`);
                  nuevoBadge.setAttribute('style', 'max-width: 480px; vertical-align: middle; cursor: help;');
                  nuevoBadge.textContent = `ALERGIA: ${nuevaAlergiaUpper}`;

                  if (typeof document.createElementNS === 'function' && typeof nuevoBadge.prepend === 'function') {
                    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svgIcon.setAttribute('width', '13');
                    svgIcon.setAttribute('height', '13');
                    svgIcon.setAttribute('fill', 'currentColor');
                    svgIcon.setAttribute('class', 'bi bi-exclamation-triangle-fill flex-shrink-0');
                    svgIcon.setAttribute('viewBox', '0 0 16 16');
                    svgIcon.setAttribute('aria-hidden', 'true');
                    svgIcon.innerHTML = '<path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>';
                    nuevoBadge.prepend(svgIcon);
                  }

                  const contenedorDatos = bannerPaciente.querySelector('.d-flex.flex-wrap.align-items-center.gap-3');
                  if (contenedorDatos) {
                    contenedorDatos.appendChild(nuevoBadge);
                  } else {
                    bannerPaciente.appendChild(nuevoBadge);
                  }
                }
              }
            }

            // Limpiar y cerrar modal
            if (textareaDesc) textareaDesc.value = '';
            window.HIS?.marcarFormularioLimpio?.(formEl);
            cerrarModal();

            // Feedback visual
            window.HIS?.anunciarCambio?.(`Antecedente ${tipo} registrado correctamente.`);
            if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
              window.HIS.mostrarMensaje('success', 'Antecedente registrado correctamente.');
            }
            return;
          }

          // Manejo de errores de respuesta HTTP
          const datosError = await resp.json().catch(() => ({}));

          if (resp.status === 422) {
            const msgs = (datosError.error && datosError.error.mensaje) ||
                         (datosError.mensaje) ||
                         'Datos de validación inválidos. La descripción debe tener entre 3 y 1000 caracteres.';
            mostrarErrorModal(msgs);
            if (textareaDesc) textareaDesc.focus();
            return;
          }

          if (resp.status === 403) {
            const msgs = (datosError.error && datosError.error.mensaje) ||
                         'Acceso denegado: no tiene permisos para registrar antecedentes en esta atención.';
            mostrarErrorModal(msgs);
            return;
          }

          if (resp.status === 409) {
            const msgs = (datosError.error && datosError.error.mensaje) ||
                         'Conflicto al guardar el antecedente.';
            mostrarErrorModal(msgs);
            return;
          }

          const msgsGenerico = (datosError.error && datosError.error.mensaje) ||
                               `Error al procesar la solicitud (${resp.status}). Intente nuevamente.`;
          mostrarErrorModal(msgsGenerico);

        } catch (err) {
          mostrarErrorModal('Error de conexión con el servidor. Intente nuevamente.');
        } finally {
          if (btnGuardar) btnGuardar.disabled = false;
          if (spinner) spinner.classList.add('d-none');
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAntecedentes);
  } else {
    initAntecedentes();
  }
})();
