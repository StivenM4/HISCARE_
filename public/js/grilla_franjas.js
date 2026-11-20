// public/js/grilla_franjas.js — Módulo de renderizado y estados de la grilla de franjas horarias (C.16)
(function (global) {
  'use strict';

  /**
   * Extrae la hora formateada HH:MM a partir de un string de fecha/hora.
   * Soporta "2026-09-21T08:00", "08:00", "2026-09-21 08:00:00", etc.
   * @param {string} fechaStr 
   * @returns {string}
   */
  function formatearHora(fechaStr) {
    if (!fechaStr) return '';
    if (fechaStr.includes('T')) {
      return fechaStr.split('T')[1].slice(0, 5);
    }
    if (fechaStr.includes(' ')) {
      return fechaStr.split(' ')[1].slice(0, 5);
    }
    return fechaStr.slice(0, 5);
  }

  /**
   * Crea el elemento HTML botón para una franja individual.
   * @param {Object} franja { inicio, fin, duracion_cita, estado }
   * @param {Object} estadoActual { seleccionadaInicio, conflictoInicio }
   * @returns {HTMLButtonElement}
   */
  function crearBotonFranja(franja, estadoActual = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.inicio = franja.inicio;
    if (franja.fin) btn.dataset.fin = franja.fin;
    if (franja.duracion_cita) btn.dataset.duracion = franja.duracion_cita;

    const horaTexto = formatearHora(franja.inicio);
    btn.textContent = horaTexto;
    btn.style.minWidth = '70px';
    btn.style.height = '38px';
    btn.style.fontWeight = '500';

    const esConflicto = estadoActual.conflictoInicio === franja.inicio || franja.estado === 'CONFLICTO' || franja.estado === 'TOMADA_OTRO';
    const esSeleccionada = estadoActual.seleccionadaInicio === franja.inicio || franja.estado === 'SELECCIONADA';

    if (esConflicto) {
      // Tomada por otro usuario: botón rojizo/naranja resaltado
      btn.className = 'btn btn-sm btn-danger text-white shadow-sm fw-bold border-0';
      btn.dataset.estado = 'CONFLICTO';
      btn.title = `Franja ${horaTexto} tomada por otro usuario`;
    } else if (esSeleccionada) {
      // Seleccionada: botón azul oscuro
      btn.className = 'btn btn-sm btn-primary active shadow-sm fw-bold';
      btn.dataset.estado = 'SELECCIONADA';
      btn.title = `Franja ${horaTexto} seleccionada`;
    } else if (franja.estado === 'LIBRE') {
      // Libre: botón blanco/borde verde claro
      btn.className = 'btn btn-sm btn-outline-success bg-white';
      btn.dataset.estado = 'LIBRE';
      btn.title = `Franja ${horaTexto} libre`;
    } else if (franja.estado === 'OCUPADA') {
      // Ocupada: botón gris con tachado
      btn.className = 'btn btn-sm btn-light text-decoration-line-through text-muted disabled border';
      btn.dataset.estado = 'OCUPADA';
      btn.disabled = true;
      btn.title = `Franja ${horaTexto} ocupada`;
    } else {
      // Pasada o deshabilitada
      btn.className = 'btn btn-sm btn-light text-muted disabled border';
      btn.dataset.estado = 'PASADA';
      btn.disabled = true;
      btn.title = `Franja ${horaTexto} no disponible (pasada)`;
    }

    return btn;
  }

  /**
   * Renderiza la grilla de franjas horarias en el contenedor dado.
   * @param {HTMLElement|string} contenedorOrId 
   * @param {Array<Object>} franjas 
   * @param {Object} opciones { onSelect, seleccionadaInicio, conflictoInicio }
   */
  function render(contenedorOrId, franjas = [], opciones = {}) {
    const contenedor = typeof contenedorOrId === 'string' ? document.getElementById(contenedorOrId) : contenedorOrId;
    if (!contenedor) return;

    contenedor.innerHTML = '';

    if (!Array.isArray(franjas) || franjas.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'text-muted small py-4 w-100 text-center bg-light rounded-3 border';
      emptyDiv.id = 'grillaFranjasVacia';
      emptyDiv.innerHTML = `
        <div class="mb-1 text-secondary">📅</div>
        <span>El profesional no tiene franjas de atención programadas para este día.</span>
      `;
      contenedor.appendChild(emptyDiv);
      return;
    }

    const docFrag = document.createDocumentFragment();

    franjas.forEach((franja) => {
      const btn = crearBotonFranja(franja, {
        seleccionadaInicio: opciones.seleccionadaInicio,
        conflictoInicio: opciones.conflictoInicio,
      });

      if (btn.dataset.estado === 'LIBRE' || btn.dataset.estado === 'SELECCIONADA') {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (btn.disabled) return;
          marcarSeleccionada(contenedor, franja.inicio);
          if (typeof opciones.onSelect === 'function') {
            opciones.onSelect(franja, btn);
          }
        });
      }

      docFrag.appendChild(btn);
    });

    contenedor.appendChild(docFrag);
  }

  /**
   * Actualiza visualmente la selección en la grilla.
   * @param {HTMLElement|string} contenedorOrId 
   * @param {string} franjaInicio 
   */
  function marcarSeleccionada(contenedorOrId, franjaInicio) {
    const contenedor = typeof contenedorOrId === 'string' ? document.getElementById(contenedorOrId) : contenedorOrId;
    if (!contenedor) return;

    contenedor.querySelectorAll('button[data-inicio]').forEach((btn) => {
      const estadoOriginal = btn.dataset.estado;

      // Si estaba en conflicto, no tocar a menos que sea la que se selecciona
      if (btn.dataset.inicio === franjaInicio) {
        btn.className = 'btn btn-sm btn-primary active shadow-sm fw-bold';
        btn.dataset.estado = 'SELECCIONADA';
        btn.disabled = false;
      } else if (estadoOriginal === 'SELECCIONADA') {
        btn.className = 'btn btn-sm btn-outline-success bg-white';
        btn.dataset.estado = 'LIBRE';
      }
    });
  }

  /**
   * Marca una franja específica como conflicto (tomada por otro usuario).
   * @param {HTMLElement|string} contenedorOrId 
   * @param {string} franjaInicio 
   */
  function marcarConflicto(contenedorOrId, franjaInicio) {
    const contenedor = typeof contenedorOrId === 'string' ? document.getElementById(contenedorOrId) : contenedorOrId;
    if (!contenedor) return;

    const btn = contenedor.querySelector(`button[data-inicio="${franjaInicio}"]`);
    if (btn) {
      btn.className = 'btn btn-sm btn-danger text-white shadow-sm fw-bold border-0';
      btn.dataset.estado = 'CONFLICTO';
      btn.disabled = true;
    }
  }

  /**
   * Limpia el contenedor y muestra un mensaje informativo o un placeholder.
   * @param {HTMLElement|string} contenedorOrId 
   * @param {string} mensaje 
   */
  function limpiar(contenedorOrId, mensaje = 'Seleccione especialidad, profesional y fecha para ver las franjas disponibles.') {
    const contenedor = typeof contenedorOrId === 'string' ? document.getElementById(contenedorOrId) : contenedorOrId;
    if (!contenedor) return;

    contenedor.innerHTML = `
      <div class="text-muted small py-4 w-100 text-center bg-light rounded-3 border border-dashed" id="grillaFranjasPlaceholder">
        <div class="mb-1 text-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-calendar-event" viewBox="0 0 16 16">
            <path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z"/>
            <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/>
          </svg>
        </div>
        <span>${mensaje}</span>
      </div>
    `;
  }

  // Exportar en el espacio de nombres global
  global.GrillaFranjas = {
    render,
    marcarSeleccionada,
    marcarConflicto,
    limpiar,
    formatearHora,
    crearBotonFranja,
  };
})(window);
