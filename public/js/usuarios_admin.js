// public/js/usuarios_admin.js — Gestión de usuarios, roles y matriz RBAC (C.12)
(function () {
  'use strict';

  // --- Estado de la aplicación cliente ---
  const state = {
    usuarios: [],
    roles: [],
    total: 0,
    page: 1,
    limit: 20,
    busqueda: '',
    filtroRol: '',
    filtroEstado: 'true', // 'todos', 'true', 'false'
    usuarioEditando: null,
    accionEstadoPendiente: null,
    usuarioActualId: null,
    usuarioActualEmail: null,
  };

  // --- Elementos del DOM ---
  const dom = {
    app: document.getElementById('adminUsuariosApp'),
    buscarInput: document.getElementById('buscarUsuarioInput'),
    filtroRolSelect: document.getElementById('filtroRolSelect'),
    filtroEstadoSelect: document.getElementById('filtroEstadoSelect'),
    btnNuevoUsuario: document.getElementById('btnNuevoUsuario'),
    totalUsuariosBadge: document.getElementById('totalUsuariosBadge'),
    loaderUsuarios: document.getElementById('loaderUsuarios'),
    cuerpoTablaUsuarios: document.getElementById('cuerpoTablaUsuarios'),
    textoPaginacion: document.getElementById('textoPaginacion'),
    btnPaginaAnterior: document.getElementById('btnPaginaAnterior'),
    btnPaginaSiguiente: document.getElementById('btnPaginaSiguiente'),
    itemPaginaAnterior: document.getElementById('itemPaginaAnterior'),
    itemPaginaSiguiente: document.getElementById('itemPaginaSiguiente'),
    spanPaginaActual: document.getElementById('spanPaginaActual'),
    cuerpoMatrizPermisos: document.getElementById('cuerpoMatrizPermisos'),

    // Modal Usuario
    modalUsuarioEl: document.getElementById('modalUsuario'),
    modalUsuarioTitulo: document.getElementById('modalUsuarioTitulo'),
    formUsuario: document.getElementById('formUsuario'),
    usuarioIdInput: document.getElementById('usuarioIdInput'),
    usuarioNombreInput: document.getElementById('usuarioNombreInput'),
    usuarioEmailInput: document.getElementById('usuarioEmailInput'),
    usuarioRolSelect: document.getElementById('usuarioRolSelect'),
    usuarioPasswordInput: document.getElementById('usuarioPasswordInput'),
    labelPasswordRequerido: document.getElementById('labelPasswordRequerido'),
    notaPasswordEditar: document.getElementById('notaPasswordEditar'),
    notaPasswordCrear: document.getElementById('notaPasswordCrear'),
    alertaModalUsuario: document.getElementById('alertaModalUsuario'),
    btnGuardarUsuario: document.getElementById('btnGuardarUsuario'),
    loaderGuardarUsuario: document.getElementById('loaderGuardarUsuario'),
    textoBtnGuardar: document.getElementById('textoBtnGuardar'),

    // Modal Confirmar Estado
    modalConfirmarEstadoEl: document.getElementById('modalConfirmarEstado'),
    modalConfirmarEstadoTitulo: document.getElementById('modalConfirmarEstadoTitulo'),
    mensajeConfirmarEstado: document.getElementById('mensajeConfirmarEstado'),
    detalleConfirmarEstado: document.getElementById('detalleConfirmarEstado'),
    iconoConfirmarEstado: document.getElementById('iconoConfirmarEstado'),
    btnConfirmarCambioEstado: document.getElementById('btnConfirmarCambioEstado'),
    loaderConfirmarEstado: document.getElementById('loaderConfirmarEstado'),
    textoBtnConfirmarEstado: document.getElementById('textoBtnConfirmarEstado'),
  };

  let modalUsuarioInstancia = null;
  let modalConfirmarEstadoInstancia = null;

  // --- Wrapper para llamadas HTTP a la API ---
  async function apiCall(url, opciones = {}) {
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

    const datos = await res.json().catch(() => ({}));
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

  // Notificaciones al usuario
  function notificar(tipo, mensaje) {
    if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
      window.HIS.mostrarMensaje(tipo, mensaje);
    } else {
      const cont = document.getElementById('alertas');
      if (cont) {
        const div = document.createElement('div');
        div.className = `alert alert-${tipo} alert-dismissible fade show shadow-sm`;
        div.setAttribute('role', 'alert');

        const span = document.createElement('span');
        span.textContent = mensaje;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-close';
        btn.setAttribute('data-bs-dismiss', 'alert');
        btn.setAttribute('aria-label', 'Cerrar');

        div.appendChild(span);
        div.appendChild(btn);

        if (typeof cont.replaceChildren === 'function') {
          cont.replaceChildren(div);
        } else {
          cont.innerHTML = '';
          cont.appendChild(div);
        }
      } else if (typeof alert === 'function') {
        alert(mensaje);
      }
    }
  }

  // --- Inicialización ---
  document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar modales Bootstrap 5 programáticamente
    if (dom.modalUsuarioEl && window.bootstrap) {
      modalUsuarioInstancia = new window.bootstrap.Modal(dom.modalUsuarioEl);
    }
    if (dom.modalConfirmarEstadoEl && window.bootstrap) {
      modalConfirmarEstadoInstancia = new window.bootstrap.Modal(dom.modalConfirmarEstadoEl);
    }

    // Datos del usuario logueado en la sesión
    if (dom.app) {
      state.usuarioActualId = dom.app.dataset.usuarioActualId || null;
      state.usuarioActualEmail = (dom.app.dataset.usuarioActualEmail || '').toLowerCase();
    }

    // Cargar datos iniciales
    await cargarRoles();
    await cargarMatrizPermisos();
    await cargarUsuarios();

    // Configurar listeners de la interfaz
    configurarEventos();
  });

  // --- Configuración de eventos ---
  function configurarEventos() {
    // Búsqueda con debounce de 300 ms
    const debouncedSearch = (window.HIS && window.HIS.debounce)
      ? window.HIS.debounce(ejecutarBusqueda, 300)
      : (() => {
          let timer;
          return (val) => {
            clearTimeout(timer);
            timer = setTimeout(() => ejecutarBusqueda(val), 300);
          };
        })();

    if (dom.buscarInput) {
      dom.buscarInput.addEventListener('input', (e) => {
        debouncedSearch(e.target.value.trim());
      });
    }

    // Filtros select reactivos
    if (dom.filtroRolSelect) {
      dom.filtroRolSelect.addEventListener('change', (e) => {
        state.filtroRol = e.target.value;
        state.page = 1;
        cargarUsuarios();
      });
    }

    if (dom.filtroEstadoSelect) {
      dom.filtroEstadoSelect.addEventListener('change', (e) => {
        state.filtroEstado = e.target.value;
        state.page = 1;
        cargarUsuarios();
      });
    }

    // Paginación
    if (dom.btnPaginaAnterior) {
      dom.btnPaginaAnterior.addEventListener('click', () => {
        if (state.page > 1) {
          state.page -= 1;
          cargarUsuarios();
        }
      });
    }

    if (dom.btnPaginaSiguiente) {
      dom.btnPaginaSiguiente.addEventListener('click', () => {
        const totalPaginas = Math.ceil(state.total / state.limit) || 1;
        if (state.page < totalPaginas) {
          state.page += 1;
          cargarUsuarios();
        }
      });
    }

    // Botón "+ Nuevo usuario"
    if (dom.btnNuevoUsuario) {
      dom.btnNuevoUsuario.addEventListener('click', abrirModalCrear);
    }

    // Formulario guardar usuario
    if (dom.formUsuario) {
      dom.formUsuario.addEventListener('submit', guardarUsuario);
    }

    // Botón confirmar cambio de estado
    if (dom.btnConfirmarCambioEstado) {
      dom.btnConfirmarCambioEstado.addEventListener('click', ejecutarCambioEstado);
    }
  }

  function ejecutarBusqueda(termino) {
    state.busqueda = termino;
    state.page = 1;
    cargarUsuarios();
  }

  // --- Carga de roles desde /api/roles ---
  async function cargarRoles() {
    try {
      const data = await apiCall('/api/roles');
      const rolesArray = Array.isArray(data) ? data : (data.filas || data.roles || []);
      state.roles = rolesArray;
      poblarSelectsRoles(rolesArray);
    } catch (err) {
      console.warn('No se pudieron obtener los roles de /api/roles, aplicando catálogo base:', err);
      // Fallback seguro con los roles del sistema HISCARE según el modelo de negocio
      const rolesBase = [
        { id: 'rol-admin', nombre: 'ADMINISTRADOR' },
        { id: 'rol-med', nombre: 'MEDICO' },
        { id: 'rol-rec', nombre: 'RECEPCIONISTA' },
        { id: 'rol-enf', nombre: 'ENFERMERO' },
        { id: 'rol-aud', nombre: 'AUDITOR' },
      ];
      state.roles = rolesBase;
      poblarSelectsRoles(rolesBase);
    }
  }

  function poblarSelectsRoles(roles) {
    // Filtro superior de roles
    if (dom.filtroRolSelect) {
      const seleccionActual = dom.filtroRolSelect.value;
      dom.filtroRolSelect.innerHTML = '<option value="">Todos</option>';
      roles.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.nombre || r.id;
        opt.textContent = r.nombre;
        dom.filtroRolSelect.appendChild(opt);
      });
      dom.filtroRolSelect.value = seleccionActual;
      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.inicializarSelect2 === 'function') {
        window.HIS.inicializarSelect2(dom.filtroRolSelect);
      }
    }

    // Select dentro del modal
    if (dom.usuarioRolSelect) {
      dom.usuarioRolSelect.innerHTML = '<option value="">Seleccione un rol institucional...</option>';
      roles.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.id; // UUID o ID para el backend
        opt.dataset.nombre = r.nombre;
        opt.textContent = r.nombre;
        dom.usuarioRolSelect.appendChild(opt);
      });
      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.inicializarSelect2 === 'function') {
        window.HIS.inicializarSelect2(dom.usuarioRolSelect);
      }
    }
  }

  // --- Carga de matriz de permisos desde /api/permisos ---
  async function cargarMatrizPermisos() {
    try {
      const data = await apiCall('/api/permisos');
      if (data && data.modulos) {
        renderizarMatrizDinamica(data.modulos);
      }
    } catch (err) {
      // Si la ruta aún responde 404 o está en construcción, la vista ya cuenta con las filas base C.12 fijas
      console.info('Matriz renderizada con configuración base de permisos.');
    }
  }

  function renderizarMatrizDinamica(modulosConfig) {
    if (!dom.cuerpoMatrizPermisos) return;

    const columnasRoles = ['MEDICO', 'RECEPCIONISTA', 'ENFERMERO', 'AUDITOR', 'ADMINISTRADOR'];
    const modulosMapeo = [
      { clave: 'pacientes', nombre: 'Pacientes', trace: 'C12-36' },
      { clave: 'agenda', nombre: 'Agenda y citas' },
      { clave: 'atenciones', nombre: 'Atención clínica' },
      { clave: 'historias', nombre: 'Historia clínica', enfNota: true },
      { clave: 'ordenes', nombre: 'Órdenes' },
      { clave: 'resultados', nombre: 'Resultados' },
      { clave: 'auditoria', nombre: 'Auditoría' },
      { clave: 'admin', nombre: 'Administración' },
    ];

    dom.cuerpoMatrizPermisos.innerHTML = '';

    modulosMapeo.forEach((m) => {
      const tr = document.createElement('tr');
      tr.dataset.modulo = m.clave;

      const tdNombre = document.createElement('td');
      tdNombre.className = 'text-start ps-3 fw-semibold text-dark';
      if (m.trace) tdNombre.setAttribute('data-trace', m.trace);
      tdNombre.textContent = m.nombre;
      tr.appendChild(tdNombre);

      const moduloInfo = modulosConfig[m.clave];

      columnasRoles.forEach((rol) => {
        const td = document.createElement('td');
        td.className = 'permiso-celda';
        td.dataset.rol = rol;

        let acciones = [];
        if (moduloInfo && moduloInfo.roles) {
          acciones = moduloInfo.roles[rol] || moduloInfo.roles['*'] || [];
        }

        const tieneL = acciones.includes('L') || rol === 'ADMINISTRADOR';
        const tieneE = acciones.includes('E') || rol === 'ADMINISTRADOR';

        if (tieneL && tieneE) {
          if (m.clave === 'historias' && rol === 'ENFERMERO') {
            td.innerHTML = '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle fw-bold">L/E*</span>';
          } else {
            td.innerHTML = '<span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-bold">L/E</span>';
          }
        } else if (tieneL) {
          td.innerHTML = '<span class="badge bg-light text-dark border">L</span>';
        } else if (tieneE) {
          td.innerHTML = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle fw-bold">E</span>';
        } else {
          td.innerHTML = '<span class="text-muted">—</span>';
        }

        tr.appendChild(td);
      });

      dom.cuerpoMatrizPermisos.appendChild(tr);
    });
  }

  // --- Carga de usuarios desde /api/usuarios ---
  async function cargarUsuarios() {
    mostrarLoaderTabla(true);

    try {
      const params = new URLSearchParams();
      if (state.busqueda) params.append('q', state.busqueda);
      if (state.filtroRol) params.append('rol', state.filtroRol);
      if (state.filtroEstado !== 'todos') {
        params.append('activo', state.filtroEstado === 'true' ? 'true' : 'false');
      }
      params.append('page', String(state.page));
      params.append('limit', String(state.limit));

      const res = await apiCall(`/api/usuarios?${params.toString()}`);

      let filas = [];
      let total = 0;

      if (Array.isArray(res)) {
        filas = res;
        total = res.length;
      } else if (res && Array.isArray(res.filas)) {
        filas = res.filas;
        total = typeof res.total === 'number' ? res.total : res.filas.length;
      } else if (res && Array.isArray(res.usuarios)) {
        filas = res.usuarios;
        total = res.total || res.usuarios.length;
      }

      state.usuarios = filas;
      state.total = total;

      renderizarTablaUsuarios(filas);
      actualizarControlesPaginacion();
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      if (dom.cuerpoTablaUsuarios) {
        dom.cuerpoTablaUsuarios.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-4 text-danger">
              <div class="mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-triangle" viewBox="0 0 16 16">
                  <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.15.15 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.2.2 0 0 1-.054.06.1.1 0 0 1-.066.017H1.146a.1.1 0 0 1-.066-.017.2.2 0 0 1-.054-.06c-.033-.06-.034-.123.002-.183L7.884 2.073a.15.15 0 0 1 .054-.057m1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767z"/>
                  <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0M7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/>
                </svg>
              </div>
              <span>No se pudo cargar el directorio de usuarios. Verifique su conexión o intente nuevamente.</span>
            </td>
          </tr>
        `;
      }
    } finally {
      mostrarLoaderTabla(false);
    }
  }

  function mostrarLoaderTabla(cargando) {
    if (dom.loaderUsuarios) {
      dom.loaderUsuarios.classList.toggle('d-none', !cargando);
    }
  }

  // --- Renderizado de filas de la tabla de usuarios ---
  function renderizarTablaUsuarios(usuarios) {
    if (!dom.cuerpoTablaUsuarios) return;

    if (window.HIS && typeof window.HIS.destruirDataTable === 'function') {
      window.HIS.destruirDataTable('#tablaUsuarios');
    }

    if (!usuarios || usuarios.length === 0) {
      dom.cuerpoTablaUsuarios.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-5 text-muted">
            <div class="mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-people text-secondary opacity-50" viewBox="0 0 16 16">
                <path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1zm-7.978-1L7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002-.014.002zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6.936 9.28a6 6 0 0 0-1.23-.247A7 7 0 0 0 5 9c-4 0-5 3-5 4q0 1 1 1h4.216A2.24 2.24 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816M4.92 10A5.5 5.5 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275ZM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0m3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/>
              </svg>
            </div>
            <span class="fw-semibold">No se encontraron usuarios con los criterios especificados.</span>
          </td>
        </tr>
      `;
      window.HIS?.anunciarCambio?.('Directorio de usuarios actualizado: 0 registros mostrados.');
      return;
    }

    dom.cuerpoTablaUsuarios.innerHTML = '';

    usuarios.forEach((u) => {
      const tr = document.createElement('tr');
      tr.dataset.usuarioId = u.id;

      // Badges por rol institucional
      const badgeRol = obtenerBadgeRol(u.rol);

      // Badge de estado [12.31]
      const badgeEstado = u.activo
        ? '<span class="badge bg-success" data-trace="C12-31">ACTIVO</span>'
        : '<span class="badge bg-secondary" data-trace="C12-31">INACTIVO</span>';

      // Especialidades concatenadas o guion [12.27]
      const especialidadesTexto = u.especialidades && u.especialidades.trim() !== ''
        ? escapeHTML(u.especialidades)
        : '<span class="text-muted">—</span>';

      // Botón Desactivar / Activar [12.33]
      const btnToggleEstado = u.activo
        ? `<button type="button" class="btn btn-sm btn-outline-danger btn-toggle-estado" data-id="${u.id}" data-nombre="${escapeHTML(u.nombre)}" data-activo="true" data-trace="C12-33" title="Desactivar usuario">Desactivar</button>`
        : `<button type="button" class="btn btn-sm btn-outline-success btn-toggle-estado" data-id="${u.id}" data-nombre="${escapeHTML(u.nombre)}" data-activo="false" data-trace="C12-33" title="Activar usuario">Activar</button>`;

      tr.innerHTML = `
        <td class="ps-3 fw-semibold text-dark">${escapeHTML(u.nombre)}</td>
        <td class="font-monospace small text-secondary">${escapeHTML(u.email)}</td>
        <td>${badgeRol}</td>
        <td class="small text-secondary">${especialidadesTexto}</td>
        <td>${badgeEstado}</td>
        <td class="text-end pe-3">
          <div class="d-inline-flex gap-1">
            <button type="button"
                    class="btn btn-sm btn-outline-primary btn-editar-usuario"
                    data-id="${u.id}"
                    data-trace="C12-32"
                    title="Editar datos del usuario">
              Editar
            </button>
            ${btnToggleEstado}
          </div>
        </td>
      `;

      dom.cuerpoTablaUsuarios.appendChild(tr);
    });

    // Enlazar eventos de botones de la tabla
    dom.cuerpoTablaUsuarios.querySelectorAll('.btn-editar-usuario').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        abrirModalEditar(id);
      });
    });

    dom.cuerpoTablaUsuarios.querySelectorAll('.btn-toggle-estado').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const nombre = btn.dataset.nombre;
        const estaActivo = btn.dataset.activo === 'true';
        abrirModalConfirmarEstado(id, nombre, estaActivo);
      });
    });

    if (window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
      window.HIS.inicializarDataTable('#tablaUsuarios', { paging: false, info: false, searching: true, ordering: true });
    }
    window.HIS?.anunciarCambio?.(`Directorio de usuarios actualizado: ${usuarios.length} registros mostrados.`);
  }

  // Badges estilizados por rol
  function obtenerBadgeRol(nombreRol) {
    const rol = (nombreRol || '').toUpperCase().trim();
    switch (rol) {
      case 'MEDICO':
        // Azul oscuro [12.30]
        return `<span class="badge" style="background-color: #1e3a8a; color: #ffffff;" data-trace="C12-30">MEDICO</span>`;
      case 'RECEPCIONISTA':
        // Azul claro
        return `<span class="badge" style="background-color: #0284c7; color: #ffffff;" data-trace="C12-30">RECEPCIONISTA</span>`;
      case 'ENFERMERO':
        // Verde azulado
        return `<span class="badge" style="background-color: #0d9488; color: #ffffff;" data-trace="C12-30">ENFERMERO</span>`;
      case 'AUDITOR':
        // Ámbar/naranja
        return `<span class="badge" style="background-color: #b45309; color: #ffffff;" data-trace="C12-30">AUDITOR</span>`;
      case 'ADMINISTRADOR':
        // Slate profundo
        return `<span class="badge" style="background-color: #312e81; color: #ffffff;" data-trace="C12-30">ADMINISTRADOR</span>`;
      default:
        return `<span class="badge bg-secondary" data-trace="C12-30">${escapeHTML(rol || 'SIN ROL')}</span>`;
    }
  }

  // --- Actualización de controles de paginación ---
  function actualizarControlesPaginacion() {
    const total = state.total;
    const page = state.page;
    const limit = state.limit;
    const totalPaginas = Math.ceil(total / limit) || 1;

    if (dom.totalUsuariosBadge) {
      dom.totalUsuariosBadge.textContent = `${total} usuario${total === 1 ? '' : 's'}`;
    }

    if (dom.spanPaginaActual) {
      dom.spanPaginaActual.textContent = `${page} / ${totalPaginas}`;
    }

    if (dom.textoPaginacion) {
      if (total === 0) {
        dom.textoPaginacion.textContent = 'Sin registros';
      } else {
        const inicio = (page - 1) * limit + 1;
        const fin = Math.min(page * limit, total);
        dom.textoPaginacion.textContent = `Mostrando ${inicio} - ${fin} de ${total} registros`;
      }
    }

    if (dom.itemPaginaAnterior) {
      dom.itemPaginaAnterior.classList.toggle('disabled', page <= 1);
    }

    if (dom.itemPaginaSiguiente) {
      dom.itemPaginaSiguiente.classList.toggle('disabled', page >= totalPaginas);
    }
  }

  // --- Modal Crear Usuario [12.43 - 12.53] ---
  function abrirModalCrear() {
    state.usuarioEditando = null;

    if (dom.modalUsuarioTitulo) {
      dom.modalUsuarioTitulo.textContent = 'Nuevo usuario';
    }

    if (dom.formUsuario) {
      dom.formUsuario.reset();
      dom.formUsuario.classList.remove('was-validated');
    }

    if (dom.usuarioIdInput) dom.usuarioIdInput.value = '';
    if (dom.usuarioNombreInput) dom.usuarioNombreInput.value = '';
    if (dom.usuarioEmailInput) dom.usuarioEmailInput.value = '';
    if (dom.usuarioRolSelect) {
      dom.usuarioRolSelect.value = '';
      if (typeof window !== 'undefined' && window.$) {
        window.$(dom.usuarioRolSelect).trigger('change');
      } else {
        dom.usuarioRolSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (dom.usuarioPasswordInput) {
      dom.usuarioPasswordInput.value = '';
      dom.usuarioPasswordInput.required = true;
    }

    if (dom.labelPasswordRequerido) dom.labelPasswordRequerido.classList.remove('d-none');
    if (dom.notaPasswordEditar) dom.notaPasswordEditar.classList.add('d-none');
    if (dom.notaPasswordCrear) dom.notaPasswordCrear.classList.remove('d-none');

    ocultarAlertaModal();

    if (dom.textoBtnGuardar) dom.textoBtnGuardar.textContent = 'Guardar usuario';

    if (modalUsuarioInstancia) {
      modalUsuarioInstancia.show();
      setTimeout(() => dom.usuarioNombreInput && dom.usuarioNombreInput.focus(), 250);
    }
  }

  // --- Modal Editar Usuario ---
  function abrirModalEditar(id) {
    const usuario = state.usuarios.find((u) => String(u.id) === String(id));
    if (!usuario) {
      notificar('warning', 'No se encontró el usuario en el listado.');
      return;
    }

    state.usuarioEditando = usuario;

    if (dom.modalUsuarioTitulo) {
      dom.modalUsuarioTitulo.textContent = 'Editar usuario';
    }

    if (dom.formUsuario) {
      dom.formUsuario.reset();
      dom.formUsuario.classList.remove('was-validated');
    }

    if (dom.usuarioIdInput) dom.usuarioIdInput.value = usuario.id;
    if (dom.usuarioNombreInput) dom.usuarioNombreInput.value = usuario.nombre;
    if (dom.usuarioEmailInput) dom.usuarioEmailInput.value = usuario.email;

    // Seleccionar el rol por ID o por coincidencia de nombre
    if (dom.usuarioRolSelect) {
      let seleccionado = false;
      if (usuario.rol_id) {
        dom.usuarioRolSelect.value = usuario.rol_id;
        if (dom.usuarioRolSelect.value === usuario.rol_id) seleccionado = true;
      }
      if (!seleccionado && usuario.rol) {
        for (let i = 0; i < dom.usuarioRolSelect.options.length; i++) {
          const opt = dom.usuarioRolSelect.options[i];
          if (opt.textContent.trim().toUpperCase() === usuario.rol.trim().toUpperCase()) {
            dom.usuarioRolSelect.selectedIndex = i;
            seleccionado = true;
            break;
          }
        }
      }
      if (!seleccionado) dom.usuarioRolSelect.value = '';

      // Notificar a Select2 del cambio de valor para sincronizar la UI
      if (typeof window !== 'undefined' && window.$) {
        window.$(dom.usuarioRolSelect).trigger('change');
      } else {
        dom.usuarioRolSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Al editar, la contraseña temporal es opcional
    if (dom.usuarioPasswordInput) {
      dom.usuarioPasswordInput.value = '';
      dom.usuarioPasswordInput.required = false;
    }

    if (dom.labelPasswordRequerido) dom.labelPasswordRequerido.classList.add('d-none');
    if (dom.notaPasswordEditar) dom.notaPasswordEditar.classList.remove('d-none');
    if (dom.notaPasswordCrear) dom.notaPasswordCrear.classList.add('d-none');

    ocultarAlertaModal();

    if (dom.textoBtnGuardar) dom.textoBtnGuardar.textContent = 'Actualizar usuario';

    if (modalUsuarioInstancia) {
      modalUsuarioInstancia.show();
      setTimeout(() => dom.usuarioNombreInput && dom.usuarioNombreInput.focus(), 250);
    }
  }

  function mostrarAlertaModal(mensaje) {
    if (dom.alertaModalUsuario) {
      dom.alertaModalUsuario.textContent = mensaje;
      dom.alertaModalUsuario.classList.remove('d-none');
    }
  }

  function ocultarAlertaModal() {
    if (dom.alertaModalUsuario) {
      dom.alertaModalUsuario.classList.add('d-none');
      dom.alertaModalUsuario.textContent = '';
    }
  }

  // --- Guardar usuario (POST al crear, PUT al editar) ---
  async function guardarUsuario(e) {
    e.preventDefault();
    ocultarAlertaModal();

    const id = dom.usuarioIdInput ? dom.usuarioIdInput.value.trim() : '';
    const esEdicion = Boolean(id);

    const nombre = dom.usuarioNombreInput ? dom.usuarioNombreInput.value.trim() : '';
    const email = dom.usuarioEmailInput ? dom.usuarioEmailInput.value.trim().toLowerCase() : '';
    const rolSelect = dom.usuarioRolSelect;
    const rol_id = rolSelect ? rolSelect.value : '';
    const password = dom.usuarioPasswordInput ? dom.usuarioPasswordInput.value : '';

    // Validaciones del lado del cliente
    if (!nombre) {
      mostrarAlertaModal('El nombre completo es obligatorio.');
      dom.usuarioNombreInput.focus();
      return;
    }

    if (!email) {
      mostrarAlertaModal('El correo institucional es obligatorio.');
      dom.usuarioEmailInput.focus();
      return;
    }

    // Validación de dominio institucional (@hiscare.edu.co)
    const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regexEmail.test(email) || !email.endsWith('@hiscare.edu.co')) {
      mostrarAlertaModal('El correo debe ser una dirección válida con dominio institucional (ej. usuario@hiscare.edu.co).');
      dom.usuarioEmailInput.focus();
      return;
    }

    if (!rol_id) {
      mostrarAlertaModal('Debe seleccionar un rol para el usuario.');
      dom.usuarioRolSelect.focus();
      return;
    }

    // Regla de seguridad: El administrador no puede quitarse el rol a sí mismo
    if (esEdicion && state.usuarioEditando) {
      const esMismoUsuario = (state.usuarioActualId && String(state.usuarioActualId) === String(id)) ||
                             (state.usuarioActualEmail && state.usuarioActualEmail === state.usuarioEditando.email.toLowerCase());
      if (esMismoUsuario) {
        const optionSeleccionada = rolSelect.options[rolSelect.selectedIndex];
        const nombreRolNuevo = (optionSeleccionada ? optionSeleccionada.textContent : '').toUpperCase();
        if (nombreRolNuevo !== 'ADMINISTRADOR') {
          mostrarAlertaModal('El administrador no puede retirarse el rol de ADMINISTRADOR a sí mismo.');
          return;
        }
      }
    }

    // Validación de contraseña temporal (mínimo 10 caracteres con letras y números)
    if (!esEdicion || password.length > 0) {
      if (password.length < 10) {
        mostrarAlertaModal('La contraseña temporal debe tener al menos 10 caracteres.');
        dom.usuarioPasswordInput.focus();
        return;
      }
      const tieneLetra = /[a-zA-Z]/.test(password);
      const tieneNumero = /[0-9]/.test(password);
      if (!tieneLetra || !tieneNumero) {
        mostrarAlertaModal('La contraseña temporal debe contener al menos una letra y un número alfanumérico.');
        dom.usuarioPasswordInput.focus();
        return;
      }
    }

    // Preparar payload
    const payload = {
      nombre,
      email,
      rol_id,
    };

    if (!esEdicion || password.length > 0) {
      payload.password_temporal = password;
    }

    setLoadingGuardar(true);

    try {
      if (esEdicion) {
        await apiCall(`/api/usuarios/${id}`, {
          method: 'PUT',
          body: payload,
        });
        notificar('success', `Usuario "${nombre}" actualizado correctamente.`);
      } else {
        await apiCall('/api/usuarios', {
          method: 'POST',
          body: payload,
        });
        notificar('success', `Usuario "${nombre}" creado exitosamente.`);
      }

      window.HIS?.marcarFormularioLimpio?.(dom.formUsuario);
      if (modalUsuarioInstancia) {
        modalUsuarioInstancia.hide();
      }

      await cargarUsuarios();
    } catch (err) {
      console.error('Error al guardar usuario:', err);

      // Manejo específico de códigos HTTP
      if (err.status === 409) {
        mostrarAlertaModal('El correo institucional ingresado ya se encuentra registrado por otro usuario en el sistema.');
      } else if (err.status === 422) {
        const campos = err.datos && err.datos.campos ? err.datos.campos.map((c) => c.msg || c.mensaje).join('<br>') : null;
        mostrarAlertaModal(campos || err.message || 'Datos inválidos. Por favor revise los campos.');
      } else if (err.status === 403) {
        mostrarAlertaModal('No cuenta con privilegios administrativos para realizar esta operación.');
      } else {
        mostrarAlertaModal(err.message || 'Ocurrió un error inesperado al procesar la solicitud.');
      }
    } finally {
      setLoadingGuardar(false);
    }
  }

  function setLoadingGuardar(cargando) {
    if (dom.btnGuardarUsuario) dom.btnGuardarUsuario.disabled = cargando;
    if (dom.loaderGuardarUsuario) dom.loaderGuardarUsuario.classList.toggle('d-none', !cargando);
  }

  // --- Modal Confirmar Cambio de Estado (Desactivar / Activar) ---
  function abrirModalConfirmarEstado(id, nombre, estaActivo) {
    const usuario = state.usuarios.find((u) => String(u.id) === String(id));

    // Regla de seguridad: El administrador no puede desactivarse a sí mismo
    const esMismoUsuario = (state.usuarioActualId && String(state.usuarioActualId) === String(id)) ||
                           (usuario && state.usuarioActualEmail && state.usuarioActualEmail === usuario.email.toLowerCase());

    if (estaActivo && esMismoUsuario) {
      notificar('warning', 'No puede desactivar su propia cuenta de administrador en sesión.');
      return;
    }

    state.accionEstadoPendiente = {
      id,
      nombre,
      nuevoEstado: !estaActivo,
    };

    if (dom.modalConfirmarEstadoTitulo) {
      dom.modalConfirmarEstadoTitulo.textContent = estaActivo ? 'Confirmar desactivación de usuario' : 'Confirmar activación de usuario';
    }

    if (dom.mensajeConfirmarEstado) {
      dom.mensajeConfirmarEstado.innerHTML = estaActivo
        ? `¿Está seguro de que desea desactivar al usuario <strong>${escapeHTML(nombre)}</strong>?`
        : `¿Está seguro de que desea reactivar al usuario <strong>${escapeHTML(nombre)}</strong>?`;
    }

    if (dom.detalleConfirmarEstado) {
      dom.detalleConfirmarEstado.textContent = estaActivo
        ? 'Al desactivar la cuenta, se revocarán todos los accesos y se cerrarán inmediatamente sus sesiones activas en el sistema.'
        : 'Al activar la cuenta, el usuario podrá volver a ingresar al sistema con sus credenciales institucionales.';
    }

    if (dom.btnConfirmarCambioEstado) {
      dom.btnConfirmarCambioEstado.className = estaActivo
        ? 'btn btn-danger d-inline-flex align-items-center gap-2'
        : 'btn btn-success d-inline-flex align-items-center gap-2';
    }

    if (dom.textoBtnConfirmarEstado) {
      dom.textoBtnConfirmarEstado.textContent = estaActivo ? 'Desactivar usuario' : 'Activar usuario';
    }

    if (dom.iconoConfirmarEstado) {
      dom.iconoConfirmarEstado.className = estaActivo ? 'text-danger' : 'text-success';
    }

    if (modalConfirmarEstadoInstancia) {
      modalConfirmarEstadoInstancia.show();
    }
  }

  async function ejecutarCambioEstado() {
    if (!state.accionEstadoPendiente) return;

    const { id, nombre, nuevoEstado } = state.accionEstadoPendiente;

    setLoadingConfirmarEstado(true);

    try {
      await apiCall(`/api/usuarios/${id}/estado`, {
        method: 'PATCH',
        body: { activo: nuevoEstado },
      });

      if (modalConfirmarEstadoInstancia) {
        modalConfirmarEstadoInstancia.hide();
      }

      notificar('success', `El usuario "${nombre}" fue ${nuevoEstado ? 'activado' : 'desactivado'} con éxito.`);
      window.HIS?.anunciarCambio?.(`Estado del usuario ${nombre} actualizado.`);
      state.accionEstadoPendiente = null;
      await cargarUsuarios();
    } catch (err) {
      console.error('Error al cambiar estado de usuario:', err);
      if (err.status === 422) {
        notificar('danger', err.message || 'No se puede cambiar el estado de este usuario (el administrador no puede desactivarse a sí mismo).');
      } else if (err.status === 403) {
        notificar('danger', 'Acceso denegado: no cuenta con permisos para modificar usuarios.');
      } else {
        notificar('danger', err.message || 'Error al actualizar el estado del usuario.');
      }
      if (modalConfirmarEstadoInstancia) {
        modalConfirmarEstadoInstancia.hide();
      }
    } finally {
      setLoadingConfirmarEstado(false);
    }
  }

  function setLoadingConfirmarEstado(cargando) {
    if (dom.btnConfirmarCambioEstado) dom.btnConfirmarCambioEstado.disabled = cargando;
    if (dom.loaderConfirmarEstado) dom.loaderConfirmarEstado.classList.toggle('d-none', !cargando);
  }

  // --- Utilidades ---
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Exposición opcional para pruebas y depuración en consola
  window.HISCARE_USUARIOS_ADMIN = {
    cargarUsuarios,
    cargarRoles,
    cargarMatrizPermisos,
    abrirModalCrear,
    abrirModalEditar,
    state,
  };
})();
