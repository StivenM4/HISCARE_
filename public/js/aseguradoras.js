// public/js/aseguradoras.js — Pantalla C.14: Catálogo de EPS y entidades aseguradoras (HIS-F-06)
(function () {
  'use strict';

  // --- Estado de la pantalla cliente ---
  const state = {
    aseguradoras: [],
    filtroBusqueda: '',
    filtroTipoPlan: '',
    entidadEditandoId: null,
    entidadEliminarId: null,
    cargando: false,
    guardando: false,
    esModoMock: false,
  };

  // --- Almacén mock resiliente (alineado con bd/03_semillas.sql) ---
  const mockStorage = {
    aseguradoras: [
      { id: 'a0000001-0000-0000-0000-000000000001', nombre: 'EPS Sanitas', tipo_plan: 'Contributivo', activo: true, afiliados: 1 },
      { id: 'a0000002-0000-0000-0000-000000000002', nombre: 'Nueva EPS', tipo_plan: 'Contributivo', activo: true, afiliados: 0 },
      { id: 'a0000003-0000-0000-0000-000000000003', nombre: 'Compensar EPS', tipo_plan: 'Contributivo', activo: true, afiliados: 0 },
      { id: 'a0000004-0000-0000-0000-000000000004', nombre: 'Capital Salud EPS', tipo_plan: 'Subsidiado', activo: true, afiliados: 0 },
      { id: 'a0000005-0000-0000-0000-000000000005', nombre: 'Fuerzas Militares', tipo_plan: 'Especial', activo: true, afiliados: 0 },
      { id: 'a0000006-0000-0000-0000-000000000006', nombre: 'Particular', tipo_plan: 'Particular', activo: true, afiliados: 0 },
    ],
  };

  // --- Elementos del DOM ---
  const dom = {
    app: document.getElementById('adminAseguradorasApp'),
    filtroBuscarEntidad: document.getElementById('filtroBuscarEntidad'),
    filtroTipoPlan: document.getElementById('filtroTipoPlan'),
    btnNuevaEntidad: document.getElementById('btnNuevaEntidad'),

    // Tabla
    tablaAseguradoras: document.getElementById('tablaAseguradoras'),
    tbodyAseguradoras: document.getElementById('tbodyAseguradoras'),
    badgeTotalEntidades: document.getElementById('badgeTotalEntidades'),
    loaderAseguradoras: document.getElementById('loaderAseguradoras'),

    // Panel Formulario Lateral
    panelFormularioEntidad: document.getElementById('panelFormularioEntidad'),
    panelTituloFormulario: document.getElementById('panelTituloFormulario'),
    badgeModoFormulario: document.getElementById('badgeModoFormulario'),
    formAseguradora: document.getElementById('formAseguradora'),
    inputAseguradoraId: document.getElementById('inputAseguradoraId'),
    inputNombreEntidad: document.getElementById('inputNombreEntidad'),
    selectTipoPlanEntidad: document.getElementById('selectTipoPlanEntidad'),
    alertaAfiliadosActivos: document.getElementById('alertaAfiliadosActivos'),
    checkActivoEntidad: document.getElementById('checkActivoEntidad'),
    alertaFormulario: document.getElementById('alertaFormulario'),
    btnCancelarFormulario: document.getElementById('btnCancelarFormulario'),
    btnGuardarEntidad: document.getElementById('btnGuardarEntidad'),
    spinnerGuardarEntidad: document.getElementById('spinnerGuardarEntidad'),
    textoBtnGuardar: document.getElementById('textoBtnGuardar'),
    btnEliminarEntidad: document.getElementById('btnEliminarEntidad'),

    // Modal Formulario
    modalFormularioEl: document.getElementById('modalFormularioEntidad'),

    // Modal Eliminar
    modalConfirmarEliminarEl: document.getElementById('modalConfirmarEliminar'),
    nombreEntidadEliminar: document.getElementById('nombreEntidadEliminar'),
    btnConfirmarEliminacion: document.getElementById('btnConfirmarEliminacion'),
    spinnerConfirmarEliminacion: document.getElementById('spinnerConfirmarEliminacion'),
  };

  let modalEliminarInstancia = null;
  let modalFormularioInstancia = null;

  function obtenerInstanciaModal(el) {
    if (!el || !window.bootstrap || !window.bootstrap.Modal) return null;
    if (typeof window.bootstrap.Modal.getOrCreateInstance === 'function') {
      return window.bootstrap.Modal.getOrCreateInstance(el);
    }
    return window.bootstrap.Modal.getInstance(el) || new window.bootstrap.Modal(el);
  }

  function limpiarEstadoModalResidual() {
    if (typeof document === 'undefined') return;
    const hayModalAbierto = Boolean(document.querySelector('.modal.show'));
    if (!hayModalAbierto) {
      document.querySelectorAll('.modal-backdrop').forEach((bd) => bd.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      document.body.removeAttribute('data-bs-overflow');
      document.body.removeAttribute('data-bs-padding-right');
    }

    const swalCont = document.querySelector('.swal2-container');
    if (swalCont) {
      const esToast = swalCont.classList.contains('swal2-toast-shown') || Boolean(swalCont.querySelector('.swal2-toast, .hiscare-toast-popup'));
      const popupVisible = Boolean(swalCont.querySelector('.swal2-popup:not(.swal2-hide)'));
      if (!esToast && !popupVisible) {
        swalCont.remove();
        document.documentElement.classList.remove('swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop');
        document.body.classList.remove('swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop');
      }
    }
  }

  function ocultarModalSeguro(el, instanciaActual) {
    if (!el) {
      limpiarEstadoModalResidual();
      return Promise.resolve();
    }

    if (document.activeElement && el.contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    const instancia = instanciaActual || obtenerInstanciaModal(el);
    const estabaVisible = el.classList.contains('show') || el.style.display === 'block';

    if (!instancia || !estabaVisible) {
      el.classList.remove('show');
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
      el.removeAttribute('aria-modal');
      el.removeAttribute('role');
      limpiarEstadoModalResidual();
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let resuelto = false;
      let timerRespaldo = null;

      const finalizar = () => {
        if (resuelto) return;
        resuelto = true;
        if (timerRespaldo) clearTimeout(timerRespaldo);
        el.removeEventListener('hidden.bs.modal', onHidden);
        if (el.classList.contains('show') || el.style.display === 'block') {
          el.classList.remove('show');
          el.style.display = 'none';
          el.setAttribute('aria-hidden', 'true');
          el.removeAttribute('aria-modal');
          el.removeAttribute('role');
        }
        limpiarEstadoModalResidual();
        resolve();
      };

      const onHidden = () => finalizar();
      el.addEventListener('hidden.bs.modal', onHidden, { once: true });
      timerRespaldo = setTimeout(finalizar, 380);

      try {
        instancia.hide();
      } catch (e) {
        finalizar();
      }
    });
  }

  function abrirModalFormulario() {
    limpiarEstadoModalResidual();
    modalFormularioInstancia = obtenerInstanciaModal(dom.modalFormularioEl);
    if (modalFormularioInstancia) {
      modalFormularioInstancia.show();
    }
  }

  function cerrarModalFormulario() {
    modalFormularioInstancia = obtenerInstanciaModal(dom.modalFormularioEl) || modalFormularioInstancia;
    return ocultarModalSeguro(dom.modalFormularioEl, modalFormularioInstancia);
  }

  // --- Capa de API ---
  async function api(url, opciones = {}) {
    if (window.HIS && typeof window.HIS.api === 'function') {
      return await window.HIS.api(url, opciones);
    }

    const res = await fetch(url, {
      method: opciones.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(opciones.headers || {}),
      },
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
      credentials: 'same-origin',
    });

    let datos = {};
    const contentType = (res.headers && res.headers.get('content-type')) || '';
    if (contentType.includes('application/json')) {
      datos = await res.json().catch(() => ({}));
    } else {
      const texto = await res.text().catch(() => '');
      try {
        datos = JSON.parse(texto);
      } catch (e) {
        datos = { error: { mensaje: texto || res.statusText } };
      }
    }

    if (res.status === 401) {
      location.href = '/auth/sesion-expirada?next=' + encodeURIComponent(location.pathname);
      throw new Error('SESION_EXPIRADA');
    }

    if (!res.ok) {
      const err = new Error((datos.error && datos.error.mensaje) || 'Error ' + res.status);
      err.status = res.status;
      err.datos = datos.error || {};
      throw err;
    }

    return datos.data !== undefined ? datos.data : datos;
  }

  // Simulación in-memory para resiliencia y desacoplamiento
  function ejecutarMockApi(url, opciones = {}) {
    const metodo = (opciones.method || 'GET').toUpperCase();
    const urlObj = new URL(url, window.location.origin);
    const pathname = urlObj.pathname;

    // GET /api/aseguradoras
    if (metodo === 'GET' && pathname === '/api/aseguradoras') {
      return JSON.parse(JSON.stringify(mockStorage.aseguradoras));
    }

    // POST /api/aseguradoras
    if (metodo === 'POST' && pathname === '/api/aseguradoras') {
      const body = opciones.body || {};
      const nombreNormalizado = (body.nombre || '').trim().toLowerCase();
      const existe = mockStorage.aseguradoras.some(
        (a) => a.nombre.trim().toLowerCase() === nombreNormalizado
      );
      if (existe) {
        const error = new Error('Ya existe una aseguradora con ese nombre');
        error.status = 409;
        throw error;
      }

      const nueva = {
        id: 'mock-' + Math.random().toString(36).substring(2, 9),
        nombre: (body.nombre || '').trim(),
        tipo_plan: body.tipo_plan || 'Contributivo',
        activo: body.activo !== undefined ? Boolean(body.activo) : true,
        afiliados: 0,
      };
      mockStorage.aseguradoras.push(nueva);
      return nueva;
    }

    // PUT /api/aseguradoras/:id
    const matchPut = pathname.match(/^\/api\/aseguradoras\/([^/]+)$/);
    if (metodo === 'PUT' && matchPut) {
      const id = matchPut[1];
      const body = opciones.body || {};
      const index = mockStorage.aseguradoras.findIndex((a) => a.id === id);
      if (index === -1) {
        const error = new Error('Aseguradora no encontrada');
        error.status = 404;
        throw error;
      }

      const nombreNormalizado = (body.nombre || '').trim().toLowerCase();
      const duplicado = mockStorage.aseguradoras.some(
        (a) => a.id !== id && a.nombre.trim().toLowerCase() === nombreNormalizado
      );
      if (duplicado) {
        const error = new Error('Ya existe otra aseguradora con ese nombre');
        error.status = 409;
        throw error;
      }

      mockStorage.aseguradoras[index].nombre = (body.nombre || '').trim();
      mockStorage.aseguradoras[index].tipo_plan = body.tipo_plan || mockStorage.aseguradoras[index].tipo_plan;
      if (body.activo !== undefined) {
        mockStorage.aseguradoras[index].activo = Boolean(body.activo);
      }
      return mockStorage.aseguradoras[index];
    }

    // PATCH /api/aseguradoras/:id/estado
    const matchPatch = pathname.match(/^\/api\/aseguradoras\/([^/]+)\/estado$/);
    if (metodo === 'PATCH' && matchPatch) {
      const id = matchPatch[1];
      const body = opciones.body || {};
      const index = mockStorage.aseguradoras.findIndex((a) => a.id === id);
      if (index === -1) {
        const error = new Error('Aseguradora no encontrada');
        error.status = 404;
        throw error;
      }
      mockStorage.aseguradoras[index].activo = Boolean(body.activo);
      return mockStorage.aseguradoras[index];
    }

    // DELETE /api/aseguradoras/:id
    const matchDel = pathname.match(/^\/api\/aseguradoras\/([^/]+)$/);
    if (metodo === 'DELETE' && matchDel) {
      const id = matchDel[1];
      const index = mockStorage.aseguradoras.findIndex((a) => a.id === id);
      if (index === -1) {
        const error = new Error('Aseguradora no encontrada');
        error.status = 404;
        throw error;
      }
      if (mockStorage.aseguradoras[index].afiliados > 0) {
        const error = new Error('La entidad tiene afiliaciones activas: no puede eliminarse');
        error.status = 409;
        throw error;
      }
      mockStorage.aseguradoras.splice(index, 1);
      return { ok: true };
    }

    return { ok: true };
  }

  // Notificación visual al usuario
  function notificar(tipo, mensaje) {
    if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
      window.HIS.mostrarMensaje(tipo, mensaje);
      return;
    }
    const cont = document.getElementById('alertas');
    if (cont) {
      const div = document.createElement('div');
      div.className = `alert alert-${tipo} alert-dismissible fade show shadow-sm`;
      div.role = 'alert';
      div.innerHTML = `
        <span>${mensaje}</span>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
      `;
      cont.replaceChildren(div);
      setTimeout(() => {
        if (div.parentNode) {
          div.classList.remove('show');
          setTimeout(() => div.remove(), 150);
        }
      }, 5000);
    }
  }

  function mostrarAlertaFormulario(mensaje) {
    if (!dom.alertaFormulario) return;
    dom.alertaFormulario.textContent = mensaje;
    dom.alertaFormulario.classList.remove('d-none');
  }

  function ocultarAlertaFormulario() {
    if (!dom.alertaFormulario) return;
    dom.alertaFormulario.textContent = '';
    dom.alertaFormulario.classList.add('d-none');
  }

  // --- Carga del catálogo ---
  async function cargarAseguradoras() {
    state.cargando = true;
    if (dom.loaderAseguradoras) dom.loaderAseguradoras.classList.remove('d-none');

    try {
      const data = await api('/api/aseguradoras?todas=true');
      const lista = Array.isArray(data) ? data : data.data || [];
      state.aseguradoras = lista;
      renderizarTabla();

      // Si no hay ninguna seleccionada actualmente, colocar el formulario en modo Nueva entidad
      if (!state.entidadEditandoId) {
        activarModoNuevaEntidad();
      } else {
        // Si la que estábamos editando aún existe, mantenerla seleccionada
        const sigueExistiendo = state.aseguradoras.find((a) => a.id === state.entidadEditandoId);
        if (sigueExistiendo) {
          cargarEnFormulario(sigueExistiendo);
        } else {
          activarModoNuevaEntidad();
        }
      }
    } catch (err) {
      console.error('Error al cargar catálogo de aseguradoras:', err);
      if (dom.tbodyAseguradoras) {
        dom.tbodyAseguradoras.innerHTML = `
          <tr>
            <td colspan="5" class="text-center py-4 text-danger small">
              No fue posible cargar las entidades aseguradoras. Por favor reintente más tarde.
            </td>
          </tr>
        `;
      }
    } finally {
      state.cargando = false;
      if (dom.loaderAseguradoras) dom.loaderAseguradoras.classList.add('d-none');
    }
  }

  // Generador de badge de Tipo de Plan
  function renderBadgeTipoPlan(tipoPlan) {
    const valor = (tipoPlan || '').trim();
    const valorUpper = valor.toUpperCase();

    if (valorUpper === 'CONTRIBUTIVO') {
      return `<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1" data-trace="C14-27">CONTRIBUTIVO</span>`;
    }
    if (valorUpper === 'SUBSIDIADO') {
      return `<span class="badge border px-2 py-1" data-trace="C14-27" style="background-color: #f3e8ff; color: #7e22ce; border-color: #d8b4fe !important;">SUBSIDIADO</span>`;
    }
    if (valorUpper === 'ESPECIAL') {
      return `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1" data-trace="C14-27">ESPECIAL</span>`;
    }
    if (valorUpper === 'PARTICULAR') {
      return `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1" data-trace="C14-27">PARTICULAR</span>`;
    }
    return `<span class="badge bg-light text-dark border px-2 py-1" data-trace="C14-27">${valorUpper || 'NO DEFINIDO'}</span>`;
  }

  // Generador de badge de Estado
  function renderBadgeEstado(activo) {
    const esActivo = Boolean(activo);
    if (esActivo) {
      return `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" data-trace="C14-28">VIGENTE</span>`;
    }
    return `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1" data-trace="C14-28">NO VIGENTE</span>`;
  }

  // --- Renderizado de la tabla ---
  function renderizarTabla() {
    if (!dom.tbodyAseguradoras) return;

    if (window.HIS && typeof window.HIS.destruirDataTable === 'function') {
      window.HIS.destruirDataTable('#tablaAseguradoras');
    }

    const query = state.filtroBusqueda.trim().toLowerCase();
    const tipoFiltro = state.filtroTipoPlan.trim();

    const filtradas = state.aseguradoras.filter((item) => {
      const coincideNombre = !query || (item.nombre || '').toLowerCase().includes(query);
      const coincideTipo = !tipoFiltro || (item.tipo_plan || '').toLowerCase() === tipoFiltro.toLowerCase();
      return coincideNombre && coincideTipo;
    });

    if (dom.badgeTotalEntidades) {
      dom.badgeTotalEntidades.textContent = filtradas.length;
    }

    if (filtradas.length === 0) {
      dom.tbodyAseguradoras.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-5 text-muted small">
            No se encontraron entidades aseguradoras con los criterios seleccionados.
          </td>
        </tr>
      `;
      window.HIS?.anunciarCambio?.('Catálogo de aseguradoras actualizado: 0 entidades visibles.');
      return;
    }

    const fragment = document.createDocumentFragment();

    filtradas.forEach((item) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-entidad-id', item.id);
      if (item.id === state.entidadEditandoId) {
        tr.classList.add('table-light', 'border-start', 'border-3', 'border-primary');
      }

      const afiliadosNum = Number(item.afiliados || 0);

      tr.innerHTML = `
        <td class="ps-3 py-3">
          <span class="fw-semibold text-dark">${escapeHtml(item.nombre)}</span>
        </td>
        <td class="py-3">
          ${renderBadgeTipoPlan(item.tipo_plan)}
        </td>
        <td class="text-center py-3" data-trace="C14-24">
          <span class="badge bg-light text-dark border px-2 py-1 fw-semibold">${afiliadosNum}</span>
        </td>
        <td class="text-center py-3">
          ${renderBadgeEstado(item.activo)}
        </td>
        <td class="text-end pe-3 py-3">
          <button type="button"
                  class="btn btn-sm btn-outline-secondary btn-editar-entidad d-inline-flex align-items-center gap-1"
                  data-trace="C14-29"
                  data-id="${item.id}">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" class="bi bi-pencil" viewBox="0 0 16 16">
              <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.5.5 0 0 1-.175-.032"/>
            </svg>
            <span>Editar</span>
          </button>
        </td>
      `;

      fragment.appendChild(tr);
    });

    dom.tbodyAseguradoras.replaceChildren(fragment);

    if (window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
      window.HIS.inicializarDataTable('#tablaAseguradoras');
    }
    window.HIS?.anunciarCambio?.(`Catálogo de aseguradoras actualizado: ${filtradas.length} entidades visibles.`);
  }

  // --- Manejo del Formulario Lateral ---

  // Modo: Crear nueva entidad
  function activarModoNuevaEntidad() {
    state.entidadEditandoId = null;

    if (dom.panelTituloFormulario) {
      dom.panelTituloFormulario.textContent = 'Nueva entidad';
    }
    if (dom.badgeModoFormulario) {
      dom.badgeModoFormulario.textContent = 'Nuevo registro';
      dom.badgeModoFormulario.className = 'badge bg-primary-subtle text-primary small';
    }

    if (dom.inputAseguradoraId) dom.inputAseguradoraId.value = '';
    if (dom.inputNombreEntidad) {
      dom.inputNombreEntidad.value = '';
      dom.inputNombreEntidad.classList.remove('is-invalid');
    }
    if (dom.selectTipoPlanEntidad) {
      dom.selectTipoPlanEntidad.value = 'Contributivo';
      dom.selectTipoPlanEntidad.classList.remove('is-invalid');
      if (typeof window !== 'undefined' && window.$) {
        window.$(dom.selectTipoPlanEntidad).trigger('change');
      } else {
        dom.selectTipoPlanEntidad.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (dom.checkActivoEntidad) dom.checkActivoEntidad.checked = true;

    // Alerta de afiliados ocultar [14.36]
    if (dom.alertaAfiliadosActivos) dom.alertaAfiliadosActivos.classList.add('d-none');

    // Botón eliminar ocultar
    if (dom.btnEliminarEntidad) dom.btnEliminarEntidad.classList.add('d-none');

    // Botón guardar
    if (dom.textoBtnGuardar) dom.textoBtnGuardar.textContent = 'Guardar cambios';

    ocultarAlertaFormulario();

    // Quitar highlight de filas en la tabla
    const activas = dom.tbodyAseguradoras.querySelectorAll('.table-light');
    activas.forEach((tr) => tr.classList.remove('table-light', 'border-start', 'border-3', 'border-primary'));
  }

  // Modo: Editar entidad existente
  function cargarEnFormulario(entidad) {
    if (!entidad) return;
    state.entidadEditandoId = entidad.id;

    if (dom.panelTituloFormulario) {
      dom.panelTituloFormulario.textContent = 'Editar entidad';
    }
    if (dom.badgeModoFormulario) {
      dom.badgeModoFormulario.textContent = 'Edición';
      dom.badgeModoFormulario.className = 'badge bg-secondary-subtle text-secondary small';
    }

    if (dom.inputAseguradoraId) dom.inputAseguradoraId.value = entidad.id;
    if (dom.inputNombreEntidad) {
      dom.inputNombreEntidad.value = entidad.nombre || '';
      dom.inputNombreEntidad.classList.remove('is-invalid');
    }
    if (dom.selectTipoPlanEntidad) {
      dom.selectTipoPlanEntidad.value = entidad.tipo_plan || 'Contributivo';
      dom.selectTipoPlanEntidad.classList.remove('is-invalid');
      if (typeof window !== 'undefined' && window.$) {
        window.$(dom.selectTipoPlanEntidad).trigger('change');
      } else {
        dom.selectTipoPlanEntidad.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (dom.checkActivoEntidad) {
      dom.checkActivoEntidad.checked = Boolean(entidad.activo);
    }

    const numAfiliados = Number(entidad.afiliados || 0);

    // Condición [14.36]: Si tiene afiliados activos > 0, advertencia visible y no puede eliminarse
    if (numAfiliados > 0) {
      if (dom.alertaAfiliadosActivos) dom.alertaAfiliadosActivos.classList.remove('d-none');
      if (dom.btnEliminarEntidad) dom.btnEliminarEntidad.classList.add('d-none');
    } else {
      if (dom.alertaAfiliadosActivos) dom.alertaAfiliadosActivos.classList.add('d-none');
      if (dom.btnEliminarEntidad) dom.btnEliminarEntidad.classList.remove('d-none');
    }

    if (dom.textoBtnGuardar) dom.textoBtnGuardar.textContent = 'Guardar cambios';

    ocultarAlertaFormulario();

    // Resaltar en la tabla
    const filas = dom.tbodyAseguradoras.querySelectorAll('tr[data-entidad-id]');
    filas.forEach((tr) => {
      if (tr.getAttribute('data-entidad-id') === entidad.id) {
        tr.classList.add('table-light', 'border-start', 'border-3', 'border-primary');
      } else {
        tr.classList.remove('table-light', 'border-start', 'border-3', 'border-primary');
      }
    });
  }

  // Guardar cambios (POST o PUT)
  async function guardarEntidad(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (state.guardando) return;

    ocultarAlertaFormulario();

    const nombre = (dom.inputNombreEntidad ? dom.inputNombreEntidad.value : '').trim();
    const tipoPlan = (dom.selectTipoPlanEntidad ? dom.selectTipoPlanEntidad.value : '').trim();
    const activo = dom.checkActivoEntidad ? dom.checkActivoEntidad.checked : true;

    // Validación local básica
    if (!nombre || nombre.length < 3 || nombre.length > 150) {
      mostrarAlertaFormulario('El nombre de la entidad aseguradora debe tener entre 3 y 150 caracteres.');
      if (dom.inputNombreEntidad) {
        dom.inputNombreEntidad.classList.add('is-invalid');
        dom.inputNombreEntidad.focus();
      }
      return;
    }
    if (dom.inputNombreEntidad) dom.inputNombreEntidad.classList.remove('is-invalid');

    const planesValidos = ['Contributivo', 'Subsidiado', 'Especial', 'Particular'];
    if (!planesValidos.includes(tipoPlan)) {
      mostrarAlertaFormulario('Seleccione un tipo de plan válido de la lista permitida.');
      if (dom.selectTipoPlanEntidad) dom.selectTipoPlanEntidad.classList.add('is-invalid');
      return;
    }
    if (dom.selectTipoPlanEntidad) dom.selectTipoPlanEntidad.classList.remove('is-invalid');

    state.guardando = true;
    if (dom.spinnerGuardarEntidad) dom.spinnerGuardarEntidad.classList.remove('d-none');
    if (dom.btnGuardarEntidad) dom.btnGuardarEntidad.disabled = true;

    const payload = {
      nombre,
      tipo_plan: tipoPlan,
      activo,
    };

    const esEdicion = Boolean(state.entidadEditandoId);
    const url = esEdicion
      ? `/api/aseguradoras/${encodeURIComponent(state.entidadEditandoId)}`
      : '/api/aseguradoras';
    const method = esEdicion ? 'PUT' : 'POST';

    try {
      const res = await api(url, {
        method,
        body: payload,
      });

      window.HIS?.marcarFormularioLimpio?.(dom.formAseguradora);

      // Si fue creación, podemos capturar el nuevo ID para mantenerlo en edición
      if (!esEdicion && res && res.id) {
        state.entidadEditandoId = res.id;
      }

      // Cerrar el modal y limpiar backdrop/body ANTES de recargar la tabla o mostrar alertas/toasts
      await cerrarModalFormulario();

      await cargarAseguradoras();

      if (state.entidadEditandoId) {
        const guardada = state.aseguradoras.find((a) => a.id === state.entidadEditandoId);
        if (guardada) cargarEnFormulario(guardada);
      }

      notificar('success', `Entidad aseguradora "${nombre}" guardada exitosamente.`);
    } catch (err) {
      console.error('Error al guardar entidad aseguradora:', err);
      if (err.status === 409) {
        mostrarAlertaFormulario('Ya existe una entidad aseguradora registrada con ese nombre.');
      } else if (err.status === 422) {
        const detalle = err.datos && (err.datos.mensaje || JSON.stringify(err.datos.campos || ''));
        mostrarAlertaFormulario(detalle || 'Los datos proporcionados no cumplen con las reglas del catálogo.');
      } else {
        mostrarAlertaFormulario(err.message || 'No fue posible guardar la entidad aseguradora. Verifique la conexión.');
      }
    } finally {
      state.guardando = false;
      if (dom.spinnerGuardarEntidad) dom.spinnerGuardarEntidad.classList.add('d-none');
      if (dom.btnGuardarEntidad) dom.btnGuardarEntidad.disabled = false;
    }
  }

  // Cancelar edición
  function cancelarEdicion() {
    ocultarAlertaFormulario();
    if (state.entidadEditandoId) {
      const actual = state.aseguradoras.find((a) => a.id === state.entidadEditandoId);
      if (actual) {
        cargarEnFormulario(actual);
        cerrarModalFormulario();
        return;
      }
    }
    activarModoNuevaEntidad();
    cerrarModalFormulario();
  }

  // Abrir modal de confirmación de eliminación
  async function prepararEliminacion() {
    if (!state.entidadEditandoId) return;
    const entidad = state.aseguradoras.find((a) => a.id === state.entidadEditandoId);
    if (!entidad) return;

    if (Number(entidad.afiliados || 0) > 0) {
      mostrarAlertaFormulario('La entidad tiene afiliaciones activas: no puede eliminarse, solo marcarse como no vigente.');
      return;
    }

    state.entidadEliminarId = entidad.id;
    if (dom.nombreEntidadEliminar) {
      dom.nombreEntidadEliminar.textContent = entidad.nombre;
    }

    // Esperar a que cierre el modal de formulario antes de abrir el de confirmación para evitar doble backdrop
    await cerrarModalFormulario();

    modalEliminarInstancia = obtenerInstanciaModal(dom.modalConfirmarEliminarEl);
    if (modalEliminarInstancia) {
      modalEliminarInstancia.show();
    }
  }

  // Confirmar eliminación en modal
  async function confirmarEliminacion() {
    if (!state.entidadEliminarId) return;

    if (dom.spinnerConfirmarEliminacion) dom.spinnerConfirmarEliminacion.classList.remove('d-none');
    if (dom.btnConfirmarEliminacion) dom.btnConfirmarEliminacion.disabled = true;

    try {
      await api(`/api/aseguradoras/${encodeURIComponent(state.entidadEliminarId)}`, {
        method: 'DELETE',
      });

      await ocultarModalSeguro(dom.modalConfirmarEliminarEl, modalEliminarInstancia);

      window.HIS?.marcarFormularioLimpio?.(dom.formAseguradora);
      state.entidadEditandoId = null;
      state.entidadEliminarId = null;
      activarModoNuevaEntidad();
      await cargarAseguradoras();
      notificar('success', 'Entidad aseguradora eliminada correctamente.');
    } catch (err) {
      console.error('Error al eliminar aseguradora:', err);
      await ocultarModalSeguro(dom.modalConfirmarEliminarEl, modalEliminarInstancia);
      if (err.status === 409) {
        mostrarAlertaFormulario('No es posible eliminar la entidad aseguradora porque posee afiliaciones activas.');
        notificar('danger', 'No es posible eliminar la aseguradora: tiene afiliaciones registradas.');
      } else {
        mostrarAlertaFormulario(err.message || 'Error al intentar eliminar la entidad aseguradora.');
        notificar('danger', 'Error al eliminar la entidad aseguradora.');
      }
    } finally {
      if (dom.spinnerConfirmarEliminacion) dom.spinnerConfirmarEliminacion.classList.add('d-none');
      if (dom.btnConfirmarEliminacion) dom.btnConfirmarEliminacion.disabled = false;
    }
  }

  // Escapar HTML auxiliar
  function escapeHtml(texto) {
    if (!texto) return '';
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Debounce para búsqueda
  function debounce(fn, ms = 250) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // --- Asignación de Event Listeners ---
  function inicializarEventos() {
    // Filtro por texto
    if (dom.filtroBuscarEntidad) {
      dom.filtroBuscarEntidad.addEventListener(
        'input',
        debounce((e) => {
          state.filtroBusqueda = e.target.value;
          renderizarTabla();
        }, 200)
      );
    }

    // Filtro por tipo de plan
    if (dom.filtroTipoPlan) {
      dom.filtroTipoPlan.addEventListener('change', (e) => {
        state.filtroTipoPlan = e.target.value;
        renderizarTabla();
      });
    }

    // Botón "+ Nueva entidad"
    if (dom.btnNuevaEntidad) {
      dom.btnNuevaEntidad.addEventListener('click', () => {
        activarModoNuevaEntidad();
        abrirModalFormulario();
      });
    }

    // Limpieza garantizada de backdrops y scroll al cerrar cualquiera de los modales
    if (dom.modalFormularioEl) {
      dom.modalFormularioEl.addEventListener('shown.bs.modal', () => {
        if (dom.inputNombreEntidad) dom.inputNombreEntidad.focus();
      });
      dom.modalFormularioEl.addEventListener('hidden.bs.modal', () => {
        limpiarEstadoModalResidual();
      });
    }
    if (dom.modalConfirmarEliminarEl) {
      dom.modalConfirmarEliminarEl.addEventListener('hidden.bs.modal', () => {
        limpiarEstadoModalResidual();
      });
    }

    // Clic en tabla (Delegación de eventos para botón Editar)
    if (dom.tbodyAseguradoras) {
      dom.tbodyAseguradoras.addEventListener('click', (e) => {
        const btnEditar = e.target.closest('.btn-editar-entidad');
        if (!btnEditar) return;
        const id = btnEditar.getAttribute('data-id');
        const entidad = state.aseguradoras.find((a) => a.id === id);
        if (entidad) {
          cargarEnFormulario(entidad);
          abrirModalFormulario();
        }
      });
    }

    // Botones del formulario lateral
    if (dom.formAseguradora) {
      dom.formAseguradora.addEventListener('submit', guardarEntidad);
    }
    if (dom.btnGuardarEntidad) {
      dom.btnGuardarEntidad.addEventListener('click', guardarEntidad);
    }
    if (dom.btnCancelarFormulario) {
      dom.btnCancelarFormulario.addEventListener('click', cancelarEdicion);
    }
    if (dom.btnEliminarEntidad) {
      dom.btnEliminarEntidad.addEventListener('click', prepararEliminacion);
    }
    if (dom.btnConfirmarEliminacion) {
      dom.btnConfirmarEliminacion.addEventListener('click', confirmarEliminacion);
    }
  }

  // --- Inicialización al cargar la página ---
  document.addEventListener('DOMContentLoaded', () => {
    inicializarEventos();
    cargarAseguradoras();
  });
})();
