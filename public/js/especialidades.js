// public/js/especialidades.js — Pantalla C.13: Especialidades médicas y asignación N:M a profesionales
(function () {
  'use strict';

  // --- Nombres de los días de la semana (ISO: 1 = Lunes, 7 = Domingo) ---
  const DIAS_SEMANA = {
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
    7: 'Domingo',
  };

  // --- Estado de la aplicación cliente ---
  const state = {
    // Catálogo global
    catalogo: [],
    filtroCatalogo: '',
    filtroCobertura: '',

    // Médicos
    medicos: [],
    medicoSeleccionadoId: null,

    // Asignación N:M para el médico activo
    especialidadesAsignadas: [], // [{ id, nombre }]
    especialidadesOriginales: [], // Copia de respaldo para Cancelar

    // Horario semanal (C.16) para el médico activo
    horarioActual: [], // [{ dia_semana, hora_inicio, hora_fin, duracion_cita }]
    horarioOriginal: [], // Copia de respaldo para Cancelar

    // Detalle inferior: Profesionales por especialidad
    especialidadActivaDetalle: null, // { id, nombre }
    profesionalesPorEspecialidad: [],

    // Banderas auxiliares
    cargandoCatalogo: false,
    cargandoMedico: false,
    cargandoProfesionales: false,
    guardandoAsignacion: false,
    esModoMock: false,
  };

  // --- Referencias al DOM con soporte defensivo ---
  const dom = {
    app: document.getElementById('adminEspecialidadesApp'),

    // Catálogo
    totalEspecialidadesBadge: document.getElementById('totalEspecialidadesBadge'),
    loaderEspecialidades: document.getElementById('loaderEspecialidades'),
    alertaDuplicado: document.getElementById('alertaDuplicado'),
    textoAlertaDuplicado: document.getElementById('textoAlertaDuplicado') || document.getElementById('alertaDuplicado'),
    btnCerrarAlertaDuplicado: document.getElementById('btnCerrarAlertaDuplicado'),
    inputNuevaEspecialidad: document.getElementById('inputNuevaEspecialidad'),
    btnAgregarEspecialidad: document.getElementById('btnAgregarEspecialidad'),
    loaderBtnAgregarEspecialidad: document.getElementById('loaderBtnAgregarEspecialidad') || document.getElementById('loaderEspecialidad'),
    textoBtnAgregarEspecialidad: document.getElementById('textoBtnAgregarEspecialidad') || document.getElementById('textoBtnEspecialidad'),
    inputBuscarEspecialidad: document.getElementById('inputBuscarEspecialidad'),
    btnLimpiarBuscarEspecialidad: document.getElementById('btnLimpiarBuscarEspecialidad'),
    filtroCoberturaCatalogo: document.getElementById('filtroCoberturaCatalogo'),
    tablaEspecialidades: document.getElementById('tablaEspecialidades'),
    tbodyEspecialidades: document.getElementById('tbodyEspecialidades') || document.getElementById('listaEspecialidadesBody'),

    // KPIs y resumen
    kpiTotalEspecialidades: document.getElementById('kpiTotalEspecialidades'),
    kpiConCobertura: document.getElementById('kpiConCobertura'),
    kpiSinAsignar: document.getElementById('kpiSinAsignar'),
    kpiMedicosActivos: document.getElementById('kpiMedicosActivos'),
    resumenMedicoSeleccionado: document.getElementById('resumenMedicoSeleccionado'),
    badgeCambiosSinGuardarEsp: document.getElementById('badgeCambiosSinGuardarEsp'),

    // Asignación N:M
    loaderMedico: document.getElementById('loaderMedico'),
    selectMedico: document.getElementById('selectMedico'),
    badgeTotalAsignadasCount: document.getElementById('badgeTotalAsignadasCount'),
    contenedorChipsEspecialidades: document.getElementById('contenedorChipsEspecialidades') || document.getElementById('chipsEspecialidadesContainer'),
    mensajeSinEspecialidades: document.getElementById('mensajeSinEspecialidades'),
    dropdownContainerAgregarEspecialidad: document.getElementById('dropdownContainerAgregarEspecialidad'),
    btnAgregarEspecialidadMedico: document.getElementById('btnAgregarEspecialidadMedico') || document.getElementById('dropdownAgregarEspecialidad'),
    dropdownEspecialidadesDisponibles: document.getElementById('dropdownEspecialidadesDisponibles') || document.getElementById('menuDisponiblesEspecialidades'),

    // Horario semanal
    badgeTotalFranjas: document.getElementById('badgeTotalFranjas'),
    tablaFranjasHorarias: document.getElementById('tablaFranjasHorarias') || document.getElementById('tablaHorarios'),
    tbodyFranjasHorarias: document.getElementById('tbodyFranjasHorarias') || document.getElementById('listaHorariosBody'),
    nuevaFranjaDia: document.getElementById('nuevaFranjaDia'),
    nuevaFranjaHoraInicio: document.getElementById('nuevaFranjaHoraInicio'),
    nuevaFranjaHoraFin: document.getElementById('nuevaFranjaHoraFin'),
    nuevaFranjaDuracion: document.getElementById('nuevaFranjaDuracion'),
    btnAgregarFranja: document.getElementById('btnAgregarFranja'),

    // Acciones Guardar / Cancelar
    btnCancelarAsignacion: document.getElementById('btnCancelarAsignacion'),
    btnGuardarAsignacion: document.getElementById('btnGuardarAsignacion'),
    loaderBtnGuardarAsignacion: document.getElementById('loaderBtnGuardarAsignacion') || document.getElementById('loaderAsignacion'),
    textoBtnGuardarAsignacion: document.getElementById('textoBtnGuardarAsignacion'),

    // Profesionales por especialidad
    spanNombreEspecialidadSeleccionada: document.getElementById('spanNombreEspecialidadSeleccionada') || document.getElementById('nombreEspecialidadSeleccionada'),
    badgeProfesionalesEspecialidadCount: document.getElementById('badgeProfesionalesEspecialidadCount'),
    tablaProfesionalesEspecialidad: document.getElementById('tablaProfesionalesEspecialidad'),
    tbodyProfesionalesEspecialidad: document.getElementById('tbodyProfesionalesEspecialidad') || document.getElementById('listaProfesionalesBody'),

    // Modal Editar
    modalEditarEspecialidadEl: document.getElementById('modalEditarEspecialidad'),
    inputEditarEspecialidadId: document.getElementById('inputEditarEspecialidadId') || document.getElementById('editEspecialidadId'),
    inputEditarEspecialidadNombre: document.getElementById('inputEditarEspecialidadNombre') || document.getElementById('editNombreEspecialidadInput'),
    alertaDuplicadoModal: document.getElementById('alertaDuplicadoModal') || document.getElementById('alertaModalEditar'),
    textoAlertaDuplicadoModal: document.getElementById('textoAlertaDuplicadoModal') || document.getElementById('alertaModalEditar'),
    btnCerrarAlertaDuplicadoModal: document.getElementById('btnCerrarAlertaDuplicadoModal'),
    btnGuardarModalEditar: document.getElementById('btnGuardarModalEditar') || document.getElementById('btnGuardarEdicionEspecialidad'),
    loaderGuardarModalEditar: document.getElementById('loaderGuardarModalEditar'),
    textoGuardarModalEditar: document.getElementById('textoGuardarModalEditar'),
  };

  function refrescarReferenciasDom() {
    dom.app = document.getElementById('adminEspecialidadesApp');
    dom.totalEspecialidadesBadge = document.getElementById('totalEspecialidadesBadge');
    dom.loaderEspecialidades = document.getElementById('loaderEspecialidades');
    dom.alertaDuplicado = document.getElementById('alertaDuplicado');
    dom.textoAlertaDuplicado = document.getElementById('textoAlertaDuplicado') || document.getElementById('alertaDuplicado');
    dom.btnCerrarAlertaDuplicado = document.getElementById('btnCerrarAlertaDuplicado');
    dom.inputNuevaEspecialidad = document.getElementById('inputNuevaEspecialidad');
    dom.btnAgregarEspecialidad = document.getElementById('btnAgregarEspecialidad');
    dom.loaderBtnAgregarEspecialidad = document.getElementById('loaderBtnAgregarEspecialidad') || document.getElementById('loaderEspecialidad');
    dom.textoBtnAgregarEspecialidad = document.getElementById('textoBtnAgregarEspecialidad') || document.getElementById('textoBtnEspecialidad');
    dom.inputBuscarEspecialidad = document.getElementById('inputBuscarEspecialidad');
    dom.btnLimpiarBuscarEspecialidad = document.getElementById('btnLimpiarBuscarEspecialidad');
    dom.filtroCoberturaCatalogo = document.getElementById('filtroCoberturaCatalogo');
    dom.tablaEspecialidades = document.getElementById('tablaEspecialidades');
    dom.tbodyEspecialidades = document.getElementById('tbodyEspecialidades') || document.getElementById('listaEspecialidadesBody');

    dom.kpiTotalEspecialidades = document.getElementById('kpiTotalEspecialidades');
    dom.kpiConCobertura = document.getElementById('kpiConCobertura');
    dom.kpiSinAsignar = document.getElementById('kpiSinAsignar');
    dom.kpiMedicosActivos = document.getElementById('kpiMedicosActivos');
    dom.resumenMedicoSeleccionado = document.getElementById('resumenMedicoSeleccionado');
    dom.badgeCambiosSinGuardarEsp = document.getElementById('badgeCambiosSinGuardarEsp');

    dom.loaderMedico = document.getElementById('loaderMedico');
    dom.selectMedico = document.getElementById('selectMedico');
    dom.badgeTotalAsignadasCount = document.getElementById('badgeTotalAsignadasCount');
    dom.contenedorChipsEspecialidades = document.getElementById('contenedorChipsEspecialidades') || document.getElementById('chipsEspecialidadesContainer');
    dom.mensajeSinEspecialidades = document.getElementById('mensajeSinEspecialidades');
    dom.dropdownContainerAgregarEspecialidad = document.getElementById('dropdownContainerAgregarEspecialidad');
    dom.btnAgregarEspecialidadMedico = document.getElementById('btnAgregarEspecialidadMedico') || document.getElementById('dropdownAgregarEspecialidad');
    dom.dropdownEspecialidadesDisponibles = document.getElementById('dropdownEspecialidadesDisponibles') || document.getElementById('menuDisponiblesEspecialidades');

    dom.badgeTotalFranjas = document.getElementById('badgeTotalFranjas');
    dom.tablaFranjasHorarias = document.getElementById('tablaFranjasHorarias') || document.getElementById('tablaHorarios');
    dom.tbodyFranjasHorarias = document.getElementById('tbodyFranjasHorarias') || document.getElementById('listaHorariosBody');
    dom.nuevaFranjaDia = document.getElementById('nuevaFranjaDia');
    dom.nuevaFranjaHoraInicio = document.getElementById('nuevaFranjaHoraInicio');
    dom.nuevaFranjaHoraFin = document.getElementById('nuevaFranjaHoraFin');
    dom.nuevaFranjaDuracion = document.getElementById('nuevaFranjaDuracion');
    dom.btnAgregarFranja = document.getElementById('btnAgregarFranja');

    dom.btnCancelarAsignacion = document.getElementById('btnCancelarAsignacion');
    dom.btnGuardarAsignacion = document.getElementById('btnGuardarAsignacion');
    dom.loaderBtnGuardarAsignacion = document.getElementById('loaderBtnGuardarAsignacion') || document.getElementById('loaderAsignacion');
    dom.textoBtnGuardarAsignacion = document.getElementById('textoBtnGuardarAsignacion');

    dom.spanNombreEspecialidadSeleccionada = document.getElementById('spanNombreEspecialidadSeleccionada') || document.getElementById('nombreEspecialidadSeleccionada');
    dom.badgeProfesionalesEspecialidadCount = document.getElementById('badgeProfesionalesEspecialidadCount');
    dom.tablaProfesionalesEspecialidad = document.getElementById('tablaProfesionalesEspecialidad');
    dom.tbodyProfesionalesEspecialidad = document.getElementById('tbodyProfesionalesEspecialidad') || document.getElementById('listaProfesionalesBody');

    dom.modalEditarEspecialidadEl = document.getElementById('modalEditarEspecialidad');
    dom.inputEditarEspecialidadId = document.getElementById('inputEditarEspecialidadId') || document.getElementById('editEspecialidadId');
    dom.inputEditarEspecialidadNombre = document.getElementById('inputEditarEspecialidadNombre') || document.getElementById('editNombreEspecialidadInput');
    dom.alertaDuplicadoModal = document.getElementById('alertaDuplicadoModal') || document.getElementById('alertaModalEditar');
    dom.textoAlertaDuplicadoModal = document.getElementById('textoAlertaDuplicadoModal') || document.getElementById('alertaModalEditar');
    dom.btnCerrarAlertaDuplicadoModal = document.getElementById('btnCerrarAlertaDuplicadoModal');
    dom.btnGuardarModalEditar = document.getElementById('btnGuardarModalEditar') || document.getElementById('btnGuardarEdicionEspecialidad');
    dom.loaderGuardarModalEditar = document.getElementById('loaderGuardarModalEditar');
    dom.textoGuardarModalEditar = document.getElementById('textoGuardarModalEditar');
  }

  let modalEditarInstancia = null;

  function obtenerInstanciaModalEditar() {
    if (!dom.modalEditarEspecialidadEl || !window.bootstrap || typeof window.bootstrap.Modal !== 'function') return null;
    if (typeof window.bootstrap.Modal.getOrCreateInstance === 'function') {
      return window.bootstrap.Modal.getOrCreateInstance(dom.modalEditarEspecialidadEl);
    }
    if (typeof window.bootstrap.Modal.getInstance === 'function') {
      return window.bootstrap.Modal.getInstance(dom.modalEditarEspecialidadEl) || new window.bootstrap.Modal(dom.modalEditarEspecialidadEl);
    }
    return new window.bootstrap.Modal(dom.modalEditarEspecialidadEl);
  }

  function limpiarBackdropResidualModal() {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    if (!document.querySelector('.modal.show')) {
      document.querySelectorAll('.modal-backdrop').forEach((bd) => bd.remove());
      if (document.body) {
        document.body.classList.remove('modal-open');
        if (document.body.style) {
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
        }
      }
    }
  }

  function actualizarKpis() {
    const total = state.catalogo.length;
    const conCobertura = state.catalogo.filter((e) => Number(e.medicos !== undefined ? e.medicos : (e.total_profesionales || 0)) > 0).length;
    const sinAsignar = Math.max(0, total - conCobertura);
    const totalMedicos = state.medicos.length;

    if (dom.kpiTotalEspecialidades) dom.kpiTotalEspecialidades.textContent = String(total);
    if (dom.kpiConCobertura) dom.kpiConCobertura.textContent = String(conCobertura);
    if (dom.kpiSinAsignar) dom.kpiSinAsignar.textContent = String(sinAsignar);
    if (dom.kpiMedicosActivos) dom.kpiMedicosActivos.textContent = String(totalMedicos);
  }

  function actualizarResumenMedico() {
    if (!dom.resumenMedicoSeleccionado) return;
    if (!state.medicoSeleccionadoId) {
      dom.resumenMedicoSeleccionado.textContent = 'Seleccione un profesional para comenzar';
      return;
    }
    const medico = state.medicos.find((m) => m.id === state.medicoSeleccionadoId);
    const correo = medico && medico.email ? `${medico.email} · ` : '';
    const nEsp = state.especialidadesAsignadas.length;
    const nFranjas = state.horarioActual.length;
    dom.resumenMedicoSeleccionado.textContent = `${correo}${nEsp} especialidad${nEsp === 1 ? '' : 'es'} · ${nFranjas} franja${nFranjas === 1 ? '' : 's'}`;
  }

  function actualizarIndicadorCambiosPendientes() {
    if (!dom.badgeCambiosSinGuardarEsp) return;
    if (!state.medicoSeleccionadoId) {
      dom.badgeCambiosSinGuardarEsp.classList.add('d-none');
      return;
    }
    const idsActuales = state.especialidadesAsignadas.map((e) => e.id).sort().join('|');
    const idsOrig = state.especialidadesOriginales.map((e) => e.id).sort().join('|');
    const horarioActualStr = JSON.stringify(state.horarioActual);
    const horarioOrigStr = JSON.stringify(state.horarioOriginal);
    const hayCambios = idsActuales !== idsOrig || horarioActualStr !== horarioOrigStr;
    dom.badgeCambiosSinGuardarEsp.classList.toggle('d-none', !hayCambios);
  }

  // --- Fallback Mock Data (para desarrollo paralelo o fallos de conexión) ---
  const mockStorage = {
    especialidades: [
      { id: 'esp-001', nombre: 'Cardiología', medicos: 1, fecha_creacion: '2024-01-10T08:00:00Z' },
      { id: 'esp-002', nombre: 'Medicina General', medicos: 2, fecha_creacion: '2024-01-12T08:00:00Z' },
      { id: 'esp-003', nombre: 'Medicina Interna', medicos: 2, fecha_creacion: '2024-01-15T08:00:00Z' },
      { id: 'esp-004', nombre: 'Pediatría', medicos: 1, fecha_creacion: '2024-02-01T08:00:00Z' },
      { id: 'esp-005', nombre: 'Ginecología', medicos: 1, fecha_creacion: '2024-02-10T08:00:00Z' },
      { id: 'esp-006', nombre: 'Ortopedia y Traumatología', medicos: 0, fecha_creacion: '2024-03-01T08:00:00Z' },
    ],
    medicos: [
      { id: 'usr-med-01', nombre: 'Dra. Ana Pérez', email: 'aperez@hiscare.edu.co', rol: 'MEDICO', fecha_creacion: '2024-01-05' },
      { id: 'usr-med-02', nombre: 'Dr. Carlos Mendoza', email: 'cmendoza@hiscare.edu.co', rol: 'MEDICO', fecha_creacion: '2024-01-08' },
      { id: 'usr-med-03', nombre: 'Dra. María Gómez', email: 'mgomez@hiscare.edu.co', rol: 'MEDICO', fecha_creacion: '2024-01-20' },
      { id: 'usr-med-04', nombre: 'Dr. Juan Diego Flórez', email: 'jflorez@hiscare.edu.co', rol: 'MEDICO', fecha_creacion: '2024-02-15' },
    ],
    asignaciones: {
      'usr-med-01': ['esp-001', 'esp-002'],
      'usr-med-02': ['esp-002', 'esp-003'],
      'usr-med-03': ['esp-003', 'esp-004'],
      'usr-med-04': ['esp-005'],
    },
    fechasAsignacion: {
      'usr-med-01:esp-001': '2024-01-15T09:00:00Z',
      'usr-med-01:esp-002': '2024-01-15T09:00:00Z',
      'usr-med-02:esp-002': '2024-02-01T10:30:00Z',
      'usr-med-02:esp-003': '2024-02-01T10:30:00Z',
      'usr-med-03:esp-003': '2024-02-15T11:00:00Z',
      'usr-med-03:esp-004': '2024-02-15T11:00:00Z',
      'usr-med-04:esp-005': '2024-03-01T08:00:00Z',
    },
    horarios: {
      'usr-med-01': [
        { dia_semana: 1, hora_inicio: '07:00', hora_fin: '13:00', duracion_cita: 20 },
        { dia_semana: 3, hora_inicio: '08:00', hora_fin: '12:00', duracion_cita: 20 },
        { dia_semana: 5, hora_inicio: '14:00', hora_fin: '18:00', duracion_cita: 30 },
      ],
      'usr-med-02': [
        { dia_semana: 2, hora_inicio: '08:00', hora_fin: '16:00', duracion_cita: 30 },
        { dia_semana: 4, hora_inicio: '08:00', hora_fin: '16:00', duracion_cita: 30 },
      ],
      'usr-med-03': [
        { dia_semana: 1, hora_inicio: '13:00', hora_fin: '19:00', duracion_cita: 20 },
        { dia_semana: 2, hora_inicio: '13:00', hora_fin: '19:00', duracion_cita: 20 },
      ],
      'usr-med-04': [
        { dia_semana: 5, hora_inicio: '07:00', hora_fin: '15:00', duracion_cita: 30 },
      ],
    },
  };

  // --- Capa de llamadas a la API con fallback ---
  async function api(url, opciones = {}) {
    if (window.HIS && typeof window.HIS.api === 'function') {
      try {
        return await window.HIS.api(url, opciones);
      } catch (err) {
        if (err.status === 409 || err.status === 422 || err.status === 401 || err.status === 403) {
          throw err;
        }
        // Si es 404 o 503, registrar y usar mock si estamos en desarrollo
        console.warn(`[HISCARE Frontend] Endpoint ${url} respondió ${err.status || 'error'}, usando respaldo.`);
        state.esModoMock = true;
        return ejecutarMockApi(url, opciones);
      }
    }

    try {
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
    } catch (err) {
      if (err.status === 409 || err.status === 422 || err.status === 401 || err.status === 403) {
        throw err;
      }
      console.warn(`[HISCARE Frontend] Fetch falló en ${url}, activando mock.`);
      state.esModoMock = true;
      return ejecutarMockApi(url, opciones);
    }
  }

  // Simulación local para soportar desarrollo en paralelo
  function ejecutarMockApi(url, opciones = {}) {
    const method = (opciones.method || 'GET').toUpperCase();

    // GET /api/especialidades
    if (url === '/api/especialidades' && method === 'GET') {
      return [...mockStorage.especialidades];
    }

    // POST /api/especialidades
    if (url === '/api/especialidades' && method === 'POST') {
      const { nombre } = opciones.body || {};
      const norm = normalizarTexto(nombre);
      const existe = mockStorage.especialidades.find((e) => normalizarTexto(e.nombre) === norm);
      if (existe) {
        const err = new Error(`"${nombre}" ya existe como "${existe.nombre}". No se permiten duplicados`);
        err.status = 409;
        err.datos = { codigo: 'DUPLICADO', mensaje: err.message, nombreExistente: existe.nombre };
        throw err;
      }
      const nueva = {
        id: 'esp-' + Math.random().toString(36).slice(2, 9),
        nombre: nombre.trim(),
        medicos: 0,
        fecha_creacion: new Date().toISOString(),
      };
      mockStorage.especialidades.unshift(nueva);
      return nueva;
    }

    // PUT /api/especialidades/:id
    const putEspMatch = url.match(/^\/api\/especialidades\/([^/]+)$/);
    if (putEspMatch && method === 'PUT') {
      const id = putEspMatch[1];
      const { nombre } = opciones.body || {};
      const norm = normalizarTexto(nombre);
      const existe = mockStorage.especialidades.find(
        (e) => e.id !== id && normalizarTexto(e.nombre) === norm
      );
      if (existe) {
        const err = new Error(`"${nombre}" ya existe como "${existe.nombre}". No se permiten duplicados`);
        err.status = 409;
        err.datos = { codigo: 'DUPLICADO', mensaje: err.message, nombreExistente: existe.nombre };
        throw err;
      }
      const item = mockStorage.especialidades.find((e) => e.id === id);
      if (item) {
        item.nombre = nombre.trim();
        return item;
      }
      throw new Error('Especialidad no encontrada');
    }

    // GET /api/medicos o /api/usuarios (listado de médicos)
    if ((url.startsWith('/api/medicos') || url === '/api/usuarios' || url.startsWith('/api/usuarios?')) && method === 'GET') {
      return [...mockStorage.medicos];
    }

    // GET /api/usuarios/:id/especialidades
    const getEspUsrMatch = url.match(/^\/api\/usuarios\/([^/]+)\/especialidades$/);
    if (getEspUsrMatch && method === 'GET') {
      const medicoId = getEspUsrMatch[1];
      const espIds = mockStorage.asignaciones[medicoId] || [];
      return mockStorage.especialidades.filter((e) => espIds.includes(e.id));
    }

    // POST /api/usuarios/:id/especialidades
    if (getEspUsrMatch && method === 'POST') {
      const medicoId = getEspUsrMatch[1];
      const { especialidad_ids } = opciones.body || {};
      mockStorage.asignaciones[medicoId] = Array.isArray(especialidad_ids)
        ? [...new Set(especialidad_ids)]
        : [];

      // Actualizar contadores en mockStorage.especialidades
      recalcularContadoresMock();
      return { ok: true, total: mockStorage.asignaciones[medicoId].length };
    }

    // GET /api/especialidades/:id/profesionales
    const getProfEspMatch = url.match(/^\/api\/especialidades\/([^/]+)\/profesionales$/);
    if (getProfEspMatch && method === 'GET') {
      const espId = getProfEspMatch[1];
      const medicosConEsp = [];
      for (const [medId, espIds] of Object.entries(mockStorage.asignaciones)) {
        if (espIds.includes(espId)) {
          const med = mockStorage.medicos.find((m) => m.id === medId);
          if (med) {
            const fechaKey = `${medId}:${espId}`;
            const fechaAsig = mockStorage.fechasAsignacion[fechaKey] || '2024-01-15T08:00:00Z';
            medicosConEsp.push({
              id: med.id,
              nombre: med.nombre,
              email: med.email,
              rol: med.rol || 'MEDICO',
              fecha_asignacion: fechaAsig,
            });
          }
        }
      }
      return medicosConEsp;
    }

    // GET /api/usuarios/:id/horario
    const getHorarioMatch = url.match(/^\/api\/usuarios\/([^/]+)\/horario$/);
    if (getHorarioMatch && method === 'GET') {
      const medicoId = getHorarioMatch[1];
      return mockStorage.horarios[medicoId] || [];
    }

    // PUT /api/usuarios/:id/horario
    if (getHorarioMatch && method === 'PUT') {
      const medicoId = getHorarioMatch[1];
      const franjas = Array.isArray(opciones.body) ? opciones.body : [];
      mockStorage.horarios[medicoId] = JSON.parse(JSON.stringify(franjas));
      return { ok: true, total: franjas.length };
    }

    return { ok: true };
  }

  function recalcularContadoresMock() {
    mockStorage.especialidades.forEach((esp) => {
      let count = 0;
      for (const espIds of Object.values(mockStorage.asignaciones)) {
        if (espIds.includes(esp.id)) count++;
      }
      esp.medicos = count;
    });
  }

  // --- Funciones utilitarias ---
  function normalizarTexto(texto) {
    if (!texto) return '';
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Formato estricto DD/MM/AAAA [13.36]
  function formatearFechaDDMMAAAA(fechaStr) {
    if (!fechaStr) return '01/01/2026';
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) {
      const parts = String(fechaStr).split(/[-/T ]/);
      if (parts.length >= 3 && parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
      return String(fechaStr);
    }
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
  }

  function notificar(tipo, mensaje) {
    if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
      window.HIS.mostrarMensaje(tipo, mensaje);
    } else {
      const cont = document.getElementById('alertas');
      if (cont) {
        const div = document.createElement('div');
        div.className = `alert alert-${tipo} alert-dismissible fade show shadow-sm`;
        div.role = 'alert';
        const span = document.createElement('span');
        span.textContent = mensaje;
        const btnClose = document.createElement('button');
        btnClose.type = 'button';
        btnClose.className = 'btn-close';
        btnClose.setAttribute('data-bs-dismiss', 'alert');
        btnClose.setAttribute('aria-label', 'Cerrar');
        div.appendChild(span);
        div.appendChild(btnClose);
        cont.replaceChildren(div);
        setTimeout(() => {
          if (div.parentNode) {
            div.classList.remove('show');
            setTimeout(() => div.remove(), 150);
          }
        }, 5000);
      } else if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
        window.HIS.mostrarMensaje(tipo, mensaje);
      } else if (typeof alert === 'function') {
        alert(mensaje);
      }
    }
  }

  // --- Alerta de Duplicado [13.23] ---
  function mostrarAlertaDuplicado(nombreIngresado, nombreExistente) {
    if (!dom.alertaDuplicado) {
      dom.alertaDuplicado = document.getElementById('alertaDuplicado');
    }
    if (!dom.alertaDuplicado) return;
    if (!dom.textoAlertaDuplicado) {
      dom.textoAlertaDuplicado = document.getElementById('textoAlertaDuplicado') || dom.alertaDuplicado;
    }
    const existente = nombreExistente || nombreIngresado;
    const mensaje = `⚠️ "${nombreIngresado}" ya existe como "${existente}". No se permiten duplicados`;
    if (dom.textoAlertaDuplicado && dom.textoAlertaDuplicado !== dom.alertaDuplicado) {
      dom.textoAlertaDuplicado.textContent = mensaje;
    } else {
      dom.alertaDuplicado.textContent = mensaje;
    }
    dom.alertaDuplicado.classList.remove('d-none');
    if (typeof dom.alertaDuplicado.scrollIntoView === 'function') {
      dom.alertaDuplicado.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function ocultarAlertaDuplicado() {
    if (dom.alertaDuplicado) {
      dom.alertaDuplicado.classList.add('d-none');
    }
  }

  // --- Inicialización al cargar la página ---
  async function iniciarApp() {
    refrescarReferenciasDom();

    // Inicializar Modal de Bootstrap
    modalEditarInstancia = obtenerInstanciaModalEditar();
    if (dom.modalEditarEspecialidadEl && typeof dom.modalEditarEspecialidadEl.addEventListener === 'function') {
      dom.modalEditarEspecialidadEl.addEventListener('hidden.bs.modal', limpiarBackdropResidualModal);
    }

    configurarEventos();

    // Carga inicial secuencial
    await cargarCatalogoEspecialidades();
    await cargarMedicos();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarApp);
  } else {
    iniciarApp();
  }

  // --- Configuración de Eventos UI ---
  function configurarEventos() {
    // Cerrar alerta de duplicado
    if (dom.btnCerrarAlertaDuplicado) {
      dom.btnCerrarAlertaDuplicado.addEventListener('click', ocultarAlertaDuplicado);
    }
    if (dom.btnCerrarAlertaDuplicadoModal) {
      dom.btnCerrarAlertaDuplicadoModal.addEventListener('click', () => {
        if (dom.alertaDuplicadoModal) dom.alertaDuplicadoModal.classList.add('d-none');
      });
    }

    // Input de nueva especialidad: ocultar aviso al escribir y capturar Enter [13.17]
    if (dom.inputNuevaEspecialidad) {
      dom.inputNuevaEspecialidad.addEventListener('input', () => {
        ocultarAlertaDuplicado();
      });
      dom.inputNuevaEspecialidad.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          agregarNuevaEspecialidad();
        }
      });
    }

    // Botón Agregar especialidad [13.18]
    if (dom.btnAgregarEspecialidad) {
      dom.btnAgregarEspecialidad.addEventListener('click', agregarNuevaEspecialidad);
    }

    // Filtro rápido del catálogo
    if (dom.inputBuscarEspecialidad) {
      dom.inputBuscarEspecialidad.addEventListener('input', (e) => {
        state.filtroCatalogo = e.target.value;
        if (dom.btnLimpiarBuscarEspecialidad) {
          dom.btnLimpiarBuscarEspecialidad.classList.toggle('d-none', !e.target.value);
        }
        renderizarTablaCatalogo();
      });
    }

    if (dom.btnLimpiarBuscarEspecialidad) {
      dom.btnLimpiarBuscarEspecialidad.addEventListener('click', () => {
        if (dom.inputBuscarEspecialidad) {
          dom.inputBuscarEspecialidad.value = '';
          state.filtroCatalogo = '';
          dom.btnLimpiarBuscarEspecialidad.classList.add('d-none');
          renderizarTablaCatalogo();
        }
      });
    }

    if (dom.filtroCoberturaCatalogo) {
      dom.filtroCoberturaCatalogo.addEventListener('change', (e) => {
        state.filtroCobertura = e.target.value || '';
        renderizarTablaCatalogo();
      });
    }

    // Select de Médico [13.26]
    if (dom.selectMedico) {
      dom.selectMedico.addEventListener('change', async (e) => {
        const medicoId = e.target.value;
        if (medicoId) {
          await seleccionarMedico(medicoId);
        } else {
          deseleccionarMedico();
        }
      });
    }

    // Botón Agregar franja horaria
    if (dom.btnAgregarFranja) {
      dom.btnAgregarFranja.addEventListener('click', agregarFranjaHoraria);
    }

    // Botón Cancelar asignación [13.37]
    if (dom.btnCancelarAsignacion) {
      dom.btnCancelarAsignacion.addEventListener('click', cancelarCambiosAsignacion);
    }

    // Botón Guardar asignación [13.38]
    if (dom.btnGuardarAsignacion) {
      dom.btnGuardarAsignacion.addEventListener('click', guardarAsignacionYHorario);
    }

    // Modal de edición de especialidad
    if (dom.btnGuardarModalEditar) {
      dom.btnGuardarModalEditar.addEventListener('click', guardarEdicionEspecialidad);
    }
  }

  // --- Carga del Catálogo de Especialidades [13.16 - 13.23] ---
  async function cargarCatalogoEspecialidades(seleccionarIdPostCarga = null) {
    state.cargandoCatalogo = true;
    if (dom.loaderEspecialidades) dom.loaderEspecialidades.classList.remove('d-none');

    try {
      const data = await api('/api/especialidades');
      state.catalogo = Array.isArray(data) ? data : (data.filas || data.especialidades || []);
      actualizarKpis();
      renderizarTablaCatalogo();
      actualizarDropdownEspecialidadesDisponibles();

      // Si no hay especialidad activa en el detalle inferior, seleccionar la primera
      if (state.catalogo.length > 0) {
        const objetivo = seleccionarIdPostCarga
          ? state.catalogo.find((e) => e.id === seleccionarIdPostCarga)
          : state.catalogo[0];
        if (objetivo) {
          seleccionarEspecialidadDetalle(objetivo.id, objetivo.nombre);
        }
      }
    } catch (err) {
      console.error('Error al cargar catálogo de especialidades:', err);
      notificar('danger', 'No fue posible cargar el catálogo de especialidades médicas.');
    } finally {
      state.cargandoCatalogo = false;
      if (dom.loaderEspecialidades) dom.loaderEspecialidades.classList.add('d-none');
    }
  }

  // Renderiza la tabla del catálogo izquierdo [13.19 - 13.22]
  function renderizarTablaCatalogo() {
    if (!dom.tbodyEspecialidades) {
      dom.tbodyEspecialidades = document.getElementById('tbodyEspecialidades') || document.getElementById('listaEspecialidadesBody');
    }
    if (!dom.tbodyEspecialidades) return;

    if (window.HIS && typeof window.HIS.destruirDataTable === 'function') {
      window.HIS.destruirDataTable('#tablaEspecialidades');
    }

    const query = normalizarTexto(state.filtroCatalogo);
    const cobertura = state.filtroCobertura || '';
    const lista = state.catalogo.filter((esp) => {
      const coincideTexto = !query || normalizarTexto(esp.nombre).includes(query);
      if (!coincideTexto) return false;
      const totalMed = Number(esp.medicos !== undefined ? esp.medicos : (esp.total_profesionales || 0));
      if (cobertura === 'con_medicos') return totalMed > 0;
      if (cobertura === 'sin_medicos') return totalMed === 0;
      return true;
    });

    if (dom.totalEspecialidadesBadge) {
      dom.totalEspecialidadesBadge.textContent = `${state.catalogo.length} especialidad${state.catalogo.length === 1 ? '' : 'es'}`;
    }

    if (lista.length === 0) {
      dom.tbodyEspecialidades.innerHTML = `
        <tr>
          <td colspan="3" class="text-center py-4 text-muted small fst-italic">
            ${(query || cobertura) ? 'No se encontraron especialidades que coincidan con el filtro.' : 'No hay especialidades registradas en el catálogo.'}
          </td>
        </tr>
      `;
      window.HIS?.anunciarCambio?.('Catálogo de especialidades actualizado: 0 visibles.');
      return;
    }

    const html = lista
      .map((esp) => {
        const totalMedicos = Number(esp.medicos !== undefined ? esp.medicos : (esp.total_profesionales || 0));
        const estaActiva = state.especialidadActivaDetalle && state.especialidadActivaDetalle.id === esp.id;
        const claseFila = estaActiva ? 'table-primary table-active' : '';
        const claseBadge = totalMedicos > 0
          ? 'bg-primary-subtle text-primary border-primary-subtle'
          : 'bg-warning-subtle text-warning-emphasis border-warning-subtle';

        return `
          <tr data-trace="C13-19"
              data-id="${escapeHtml(esp.id)}"
              data-nombre="${escapeHtml(esp.nombre)}"
              class="${claseFila} fila-especialidad"
              style="cursor: pointer;">
            <td class="py-2 px-3 fw-semibold text-dark text-break celda-nombre-esp">
              ${escapeHtml(esp.nombre)}
            </td>
            <td class="py-2 px-3 text-center">
              <span class="badge rounded-pill border px-2 py-1 ${claseBadge}" data-trace="C13-21">
                ${totalMedicos}
              </span>
            </td>
            <td class="py-2 px-3 text-end">
              <button type="button"
                      class="btn btn-sm btn-outline-secondary py-1 px-2 btn-editar-especialidad"
                      data-trace="C13-22"
                      data-id="${escapeHtml(esp.id)}"
                      data-nombre="${escapeHtml(esp.nombre)}"
                      title="Editar nombre de la especialidad">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-pencil me-1" viewBox="0 0 16 16">
                  <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325"/>
                </svg>
                <span>Editar</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    dom.tbodyEspecialidades.innerHTML = html;

    // Asignar listeners a filas y botones de edición
    dom.tbodyEspecialidades.querySelectorAll('.fila-especialidad').forEach((fila) => {
      fila.addEventListener('click', (e) => {
        // Si hizo clic en el botón de editar, no cambiar la selección de detalle
        if (e.target.closest('.btn-editar-especialidad')) return;
        const id = fila.dataset.id;
        const nombre = fila.dataset.nombre;
        seleccionarEspecialidadDetalle(id, nombre);
      });
    });

    dom.tbodyEspecialidades.querySelectorAll('.btn-editar-especialidad').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirModalEditar(btn.dataset.id, btn.dataset.nombre);
      });
    });

    if (window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
      window.HIS.inicializarDataTable('#tablaEspecialidades');
    }
    window.HIS?.anunciarCambio?.(`Catálogo de especialidades actualizado: ${lista.length} visibles.`);
  }

  // --- Agregar Nueva Especialidad al Catálogo [13.17 - 13.18, 13.23] ---
  async function agregarNuevaEspecialidad() {
    if (!dom.inputNuevaEspecialidad) return;
    const nombre = dom.inputNuevaEspecialidad.value.trim();

    if (!nombre) {
      dom.inputNuevaEspecialidad.focus();
      return;
    }

    if (nombre.length < 3 || nombre.length > 100) {
      notificar('warning', 'El nombre de la especialidad debe tener entre 3 y 100 caracteres.');
      dom.inputNuevaEspecialidad.focus();
      return;
    }

    // Normalización de primera letra en mayúscula
    const nombreNormalizado = nombre.charAt(0).toUpperCase() + nombre.slice(1);
    const norm = normalizarTexto(nombreNormalizado);

    // Validación preventiva en cliente contra duplicados en el catálogo local
    const duplicadoLocal = state.catalogo.find((e) => normalizarTexto(e.nombre) === norm);
    if (duplicadoLocal) {
      mostrarAlertaDuplicado(nombreNormalizado, duplicadoLocal.nombre);
      dom.inputNuevaEspecialidad.focus();
      return;
    }

    ocultarAlertaDuplicado();
    setBotonAgregarCargando(true);

    try {
      const res = await api('/api/especialidades', {
        method: 'POST',
        body: { nombre: nombreNormalizado },
      });

      dom.inputNuevaEspecialidad.value = '';
      window.HIS?.marcarFormularioLimpio?.();
      notificar('success', `Especialidad "${nombreNormalizado}" agregada exitosamente al catálogo.`);
      await cargarCatalogoEspecialidades(res && res.id ? res.id : null);
    } catch (err) {
      if (err.status === 409 || (err.datos && err.datos.codigo === 'DUPLICADO')) {
        const existente = (err.datos && err.datos.nombreExistente) || nombreNormalizado;
        mostrarAlertaDuplicado(nombreNormalizado, existente);
      } else {
        notificar('danger', (err.datos && err.datos.mensaje) || err.message || 'Error al agregar la especialidad.');
      }
    } finally {
      setBotonAgregarCargando(false);
      dom.inputNuevaEspecialidad.focus();
    }
  }

  function setBotonAgregarCargando(cargando) {
    if (!dom.btnAgregarEspecialidad) return;
    dom.btnAgregarEspecialidad.disabled = cargando;
    if (dom.loaderBtnAgregarEspecialidad) {
      dom.loaderBtnAgregarEspecialidad.classList.toggle('d-none', !cargando);
    }
    if (dom.textoBtnAgregarEspecialidad) {
      dom.textoBtnAgregarEspecialidad.textContent = cargando ? 'Agregando...' : 'Agregar';
    }
  }

  // --- Modal Editar Especialidad [13.22] ---
  function abrirModalEditar(id, nombre) {
    if (!dom.modalEditarEspecialidadEl) dom.modalEditarEspecialidadEl = document.getElementById('modalEditarEspecialidad');
    if (!dom.inputEditarEspecialidadId) dom.inputEditarEspecialidadId = document.getElementById('inputEditarEspecialidadId') || document.getElementById('editEspecialidadId');
    if (!dom.inputEditarEspecialidadNombre) dom.inputEditarEspecialidadNombre = document.getElementById('inputEditarEspecialidadNombre') || document.getElementById('editNombreEspecialidadInput');
    if (!dom.alertaDuplicadoModal) dom.alertaDuplicadoModal = document.getElementById('alertaDuplicadoModal') || document.getElementById('alertaModalEditar');

    if (!dom.modalEditarEspecialidadEl) return;
    if (dom.inputEditarEspecialidadId) dom.inputEditarEspecialidadId.value = id;
    if (dom.inputEditarEspecialidadNombre) dom.inputEditarEspecialidadNombre.value = nombre;
    if (dom.alertaDuplicadoModal) dom.alertaDuplicadoModal.classList.add('d-none');

    modalEditarInstancia = obtenerInstanciaModalEditar() || modalEditarInstancia;

    if (modalEditarInstancia) {
      modalEditarInstancia.show();
      setTimeout(() => {
        if (dom.inputEditarEspecialidadNombre) dom.inputEditarEspecialidadNombre.focus();
      }, 300);
    }
  }

  async function guardarEdicionEspecialidad() {
    if (!dom.inputEditarEspecialidadId) dom.inputEditarEspecialidadId = document.getElementById('inputEditarEspecialidadId') || document.getElementById('editEspecialidadId');
    if (!dom.inputEditarEspecialidadNombre) dom.inputEditarEspecialidadNombre = document.getElementById('inputEditarEspecialidadNombre') || document.getElementById('editNombreEspecialidadInput');
    if (!dom.btnGuardarModalEditar) dom.btnGuardarModalEditar = document.getElementById('btnGuardarModalEditar') || document.getElementById('btnGuardarEdicionEspecialidad');

    const id = dom.inputEditarEspecialidadId ? dom.inputEditarEspecialidadId.value : '';
    const nombre = dom.inputEditarEspecialidadNombre ? dom.inputEditarEspecialidadNombre.value.trim() : '';

    if (!nombre) {
      if (dom.inputEditarEspecialidadNombre) dom.inputEditarEspecialidadNombre.focus();
      return;
    }

    if (nombre.length < 3 || nombre.length > 100) {
      mostrarErrorModalEditar('El nombre debe tener entre 3 y 100 caracteres.');
      return;
    }

    const nombreNormalizado = nombre.charAt(0).toUpperCase() + nombre.slice(1);
    const norm = normalizarTexto(nombreNormalizado);

    // Comprobación de duplicado con otros elementos
    const duplicadoLocal = state.catalogo.find((e) => e.id !== id && normalizarTexto(e.nombre) === norm);
    if (duplicadoLocal) {
      mostrarErrorModalEditar(`⚠️ "${nombreNormalizado}" ya existe como "${duplicadoLocal.nombre}". No se permiten duplicados`);
      return;
    }

    setBotonModalEditarCargando(true);

    try {
      await api(`/api/especialidades/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: { nombre: nombreNormalizado },
      });

      if (modalEditarInstancia) modalEditarInstancia.hide();
      limpiarBackdropResidualModal();
      window.HIS?.marcarFormularioLimpio?.();
      notificar('success', `Especialidad actualizada a "${nombreNormalizado}".`);
      await cargarCatalogoEspecialidades(id);
    } catch (err) {
      if (err.status === 409 || (err.datos && err.datos.codigo === 'DUPLICADO')) {
        const existente = (err.datos && err.datos.nombreExistente) || nombreNormalizado;
        mostrarErrorModalEditar(`⚠️ "${nombreNormalizado}" ya existe como "${existente}". No se permiten duplicados`);
      } else {
        mostrarErrorModalEditar((err.datos && err.datos.mensaje) || err.message || 'Error al actualizar especialidad.');
      }
    } finally {
      setBotonModalEditarCargando(false);
    }
  }

  function mostrarErrorModalEditar(mensaje) {
    if (!dom.alertaDuplicadoModal) dom.alertaDuplicadoModal = document.getElementById('alertaDuplicadoModal') || document.getElementById('alertaModalEditar');
    if (!dom.textoAlertaDuplicadoModal) dom.textoAlertaDuplicadoModal = document.getElementById('textoAlertaDuplicadoModal') || dom.alertaDuplicadoModal;
    if (!dom.alertaDuplicadoModal) return;
    if (dom.textoAlertaDuplicadoModal && dom.textoAlertaDuplicadoModal !== dom.alertaDuplicadoModal) {
      dom.textoAlertaDuplicadoModal.textContent = mensaje;
    } else {
      dom.alertaDuplicadoModal.textContent = mensaje;
    }
    dom.alertaDuplicadoModal.classList.remove('d-none');
  }

  function setBotonModalEditarCargando(cargando) {
    if (!dom.btnGuardarModalEditar) return;
    dom.btnGuardarModalEditar.disabled = cargando;
    if (dom.loaderGuardarModalEditar) {
      dom.loaderGuardarModalEditar.classList.toggle('d-none', !cargando);
    }
    if (dom.textoGuardarModalEditar) {
      dom.textoGuardarModalEditar.textContent = cargando ? 'Guardando...' : 'Guardar cambios';
    }
  }

  // --- Carga de Médicos Activos [13.26] ---
  async function cargarMedicos() {
    if (!dom.selectMedico) return;

    try {
      // Intentar primero endpoint /api/medicos, fallback a /api/usuarios?rol=MEDICO
      let data;
      try {
        data = await api('/api/medicos');
      } catch {
        data = await api('/api/usuarios?rol=MEDICO&activo=true');
      }

      state.medicos = Array.isArray(data) ? data : (data.filas || data.medicos || []);
      actualizarKpis();

      const opcionesHtml = [
        '<option value="">Seleccione un profesional médico...</option>',
        ...state.medicos.map((m) => {
          const texto = `${m.nombre} — ${m.email || 'Sin correo'}`;
          return `<option value="${escapeHtml(m.id)}">${escapeHtml(texto)}</option>`;
        }),
      ].join('');

      dom.selectMedico.innerHTML = opcionesHtml;
      if (window.HIS && typeof window.HIS.inicializarSelect2 === 'function') {
        window.HIS.inicializarSelect2(dom.selectMedico);
      }

      // Seleccionar automáticamente al primer médico activo disponible
      if (state.medicos.length > 0) {
        dom.selectMedico.value = state.medicos[0].id;
        await seleccionarMedico(state.medicos[0].id);
      }
    } catch (err) {
      console.error('Error al cargar médicos:', err);
      dom.selectMedico.innerHTML = '<option value="">Error al cargar profesionales</option>';
    }
  }

  // --- Selección de un Médico para Asignación N:M [13.25 - 13.31] ---
  async function seleccionarMedico(medicoId) {
    state.medicoSeleccionadoId = medicoId;
    state.cargandoMedico = true;
    if (dom.loaderMedico) dom.loaderMedico.classList.remove('d-none');

    try {
      // 1. Cargar especialidades asignadas al usuario
      const espData = await api(`/api/usuarios/${encodeURIComponent(medicoId)}/especialidades`);
      const asignadas = Array.isArray(espData) ? espData : (espData.especialidades || []);

      state.especialidadesAsignadas = asignadas.map((e) => ({
        id: e.id || e.especialidad_id,
        nombre: e.nombre || e.especialidad_nombre || 'Especialidad',
      }));
      state.especialidadesOriginales = JSON.parse(JSON.stringify(state.especialidadesAsignadas));

      // 2. Cargar horario semanal del médico
      try {
        const horarioData = await api(`/api/usuarios/${encodeURIComponent(medicoId)}/horario`);
        state.horarioActual = Array.isArray(horarioData) ? horarioData : (horarioData.horarios || []);
      } catch {
        state.horarioActual = [];
      }
      state.horarioOriginal = JSON.parse(JSON.stringify(state.horarioActual));

      renderizarChipsEspecialidades();
      actualizarDropdownEspecialidadesDisponibles();
      renderizarTablaHorario();
      actualizarResumenMedico();
      actualizarIndicadorCambiosPendientes();
    } catch (err) {
      console.error('Error al cargar asignación y horario del médico:', err);
      notificar('danger', 'Error al cargar los datos del profesional seleccionado.');
    } finally {
      state.cargandoMedico = false;
      if (dom.loaderMedico) dom.loaderMedico.classList.add('d-none');
    }
  }

  function deseleccionarMedico() {
    state.medicoSeleccionadoId = null;
    state.especialidadesAsignadas = [];
    state.especialidadesOriginales = [];
    state.horarioActual = [];
    state.horarioOriginal = [];

    renderizarChipsEspecialidades();
    actualizarDropdownEspecialidadesDisponibles();
    renderizarTablaHorario();
    actualizarResumenMedico();
    actualizarIndicadorCambiosPendientes();
  }

  // --- Renderizado de Chips de Especialidades Asignadas [13.28 - 13.29] ---
  function renderizarChipsEspecialidades() {
    if (!dom.contenedorChipsEspecialidades) {
      dom.contenedorChipsEspecialidades = document.getElementById('contenedorChipsEspecialidades') || document.getElementById('chipsEspecialidadesContainer');
    }
    if (!dom.contenedorChipsEspecialidades) return;

    if (dom.badgeTotalAsignadasCount) {
      dom.badgeTotalAsignadasCount.textContent = `${state.especialidadesAsignadas.length} asignada${state.especialidadesAsignadas.length === 1 ? '' : 's'}`;
    }

    // Remover chips antiguos respetando el botón de dropdown y mensaje vacío
    const chipsAntiguos = dom.contenedorChipsEspecialidades.querySelectorAll('.chip-especialidad');
    chipsAntiguos.forEach((c) => c.remove());

    if (state.especialidadesAsignadas.length === 0) {
      if (dom.mensajeSinEspecialidades) {
        dom.mensajeSinEspecialidades.classList.remove('d-none');
        dom.mensajeSinEspecialidades.textContent = state.medicoSeleccionadoId
          ? 'No hay especialidades asignadas a este profesional.'
          : 'Seleccione un profesional médico arriba para ver y configurar sus especialidades.';
      }
    } else {
      if (dom.mensajeSinEspecialidades) {
        dom.mensajeSinEspecialidades.classList.add('d-none');
      }

      // Crear cada chip de especialidad con data-trace="C13-28" y botón × con data-trace="C13-29"
      state.especialidadesAsignadas.forEach((esp) => {
        const chip = document.createElement('span');
        chip.className = 'badge bg-white text-dark border shadow-sm px-3 py-2 d-inline-flex align-items-center gap-2 rounded-pill chip-especialidad';
        chip.setAttribute('data-trace', 'C13-28');
        chip.dataset.id = esp.id;

        chip.innerHTML = `
          <span class="fw-semibold small">${escapeHtml(esp.nombre)}</span>
          <button type="button"
                  class="btn-close btn-close-sm btn-quitar-chip"
                  data-trace="C13-29"
                  data-id="${escapeHtml(esp.id)}"
                  aria-label="Quitar ${escapeHtml(esp.nombre)}"
                  style="font-size: 0.65rem;"></button>
        `;

        const btnQuitar = chip.querySelector('.btn-quitar-chip');
        if (btnQuitar) {
          btnQuitar.addEventListener('click', () => {
            removerEspecialidadDeMedico(esp.id);
          });
        }

        // Insertar antes del contenedor de dropdown "+ Agregar especialidad"
        if (dom.dropdownContainerAgregarEspecialidad) {
          dom.contenedorChipsEspecialidades.insertBefore(chip, dom.dropdownContainerAgregarEspecialidad);
        } else {
          dom.contenedorChipsEspecialidades.appendChild(chip);
        }
      });
    }

    actualizarDropdownEspecialidadesDisponibles();
  }

  // --- Dropdown "+ Agregar especialidad" [13.30] ---
  function actualizarDropdownEspecialidadesDisponibles() {
    if (!dom.dropdownEspecialidadesDisponibles) {
      dom.dropdownEspecialidadesDisponibles = document.getElementById('dropdownEspecialidadesDisponibles') || document.getElementById('menuDisponiblesEspecialidades');
    }
    if (!dom.btnAgregarEspecialidadMedico) {
      dom.btnAgregarEspecialidadMedico = document.getElementById('btnAgregarEspecialidadMedico') || document.getElementById('dropdownAgregarEspecialidad');
    }
    if (!dom.dropdownEspecialidadesDisponibles) return;

    if (!state.medicoSeleccionadoId) {
      dom.dropdownEspecialidadesDisponibles.innerHTML = `
        <li><span class="dropdown-item-text text-muted small">Seleccione un médico primero</span></li>
      `;
      if (dom.btnAgregarEspecialidadMedico) dom.btnAgregarEspecialidadMedico.disabled = true;
      return;
    }

    if (dom.btnAgregarEspecialidadMedico) dom.btnAgregarEspecialidadMedico.disabled = false;

    const idsAsignadas = new Set(state.especialidadesAsignadas.map((e) => e.id));
    const disponibles = state.catalogo.filter((e) => !idsAsignadas.has(e.id));

    if (disponibles.length === 0) {
      dom.dropdownEspecialidadesDisponibles.innerHTML = `
        <li><span class="dropdown-item-text text-muted small fst-italic">Todas las especialidades del catálogo ya han sido asignadas.</span></li>
      `;
      return;
    }

    const html = disponibles
      .map((esp) => {
        return `
          <li>
            <button class="dropdown-item small py-2 px-3 btn-opcion-agregar-esp" type="button" data-id="${escapeHtml(esp.id)}" data-nombre="${escapeHtml(esp.nombre)}">
              <span class="fw-medium">${escapeHtml(esp.nombre)}</span>
            </button>
          </li>
        `;
      })
      .join('');

    dom.dropdownEspecialidadesDisponibles.innerHTML = html;

    dom.dropdownEspecialidadesDisponibles.querySelectorAll('.btn-opcion-agregar-esp').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const nombre = btn.dataset.nombre;
        agregarEspecialidadAMedico(id, nombre);
      });
    });
  }

  function agregarEspecialidadAMedico(id, nombre) {
    if (!state.medicoSeleccionadoId) {
      notificar('warning', 'Seleccione primero un profesional médico.');
      return;
    }

    // Garantizar unicidad N:M en cliente [13.31]
    const yaAsignada = state.especialidadesAsignadas.some((e) => e.id === id);
    if (yaAsignada) {
      notificar('info', `La especialidad "${nombre}" ya está asignada a este profesional.`);
      return;
    }

    state.especialidadesAsignadas.push({ id, nombre });
    renderizarChipsEspecialidades();
    actualizarResumenMedico();
    actualizarIndicadorCambiosPendientes();
  }

  function removerEspecialidadDeMedico(id) {
    state.especialidadesAsignadas = state.especialidadesAsignadas.filter((e) => e.id !== id);
    renderizarChipsEspecialidades();
    actualizarResumenMedico();
    actualizarIndicadorCambiosPendientes();
  }

  // --- Gestión de Horario Semanal (C.16) ---
  function renderizarTablaHorario() {
    if (!dom.tbodyFranjasHorarias) {
      dom.tbodyFranjasHorarias = document.getElementById('tbodyFranjasHorarias') || document.getElementById('listaHorariosBody');
    }
    if (!dom.tbodyFranjasHorarias) return;

    if (dom.badgeTotalFranjas) {
      dom.badgeTotalFranjas.textContent = `${state.horarioActual.length} franja${state.horarioActual.length === 1 ? '' : 's'}`;
    }

    if (state.horarioActual.length === 0) {
      dom.tbodyFranjasHorarias.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-3 text-muted small fst-italic">
            ${state.medicoSeleccionadoId ? 'No hay franjas horarias configuradas para este profesional.' : 'Seleccione un profesional para ver su horario.'}
          </td>
        </tr>
      `;
      return;
    }

    // Ordenar franjas en sitio por día de la semana (1 a 7) y hora_inicio para mantener índices consistentes
    state.horarioActual.sort((a, b) => {
      const diaA = Number(a.dia_semana) || 0;
      const diaB = Number(b.dia_semana) || 0;
      if (diaA !== diaB) return diaA - diaB;
      const hA = String(a.hora_inicio || '');
      const hB = String(b.hora_inicio || '');
      return hA.localeCompare(hB);
    });

    const html = state.horarioActual
      .map((f, index) => {
        const nombreDia = DIAS_SEMANA[f.dia_semana] || `Día ${f.dia_semana}`;
        const duracion = f.duracion_cita || 20;

        return `
          <tr>
            <td class="py-2 px-2 small fw-semibold text-dark">${escapeHtml(nombreDia)}</td>
            <td class="py-2 px-2 small font-tabular">${escapeHtml(f.hora_inicio)}</td>
            <td class="py-2 px-2 small font-tabular">${escapeHtml(f.hora_fin)}</td>
            <td class="py-2 px-2 small font-tabular">${duracion} min</td>
            <td class="py-2 px-2 small text-end">
              <button type="button"
                      class="btn btn-outline-danger btn-sm py-0 px-2 btn-eliminar-franja"
                      data-index="${index}"
                      title="Eliminar franja horaria">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16">
                  <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5a.5.5 0 0 1 .47-.528M8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5m2.472.5a.5.5 0 0 1 .47.528l-.5 8.5a.5.5 0 0 1-.998-.06l.5-8.5a.5.5 0 0 1 .528-.47"/>
                </svg>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    dom.tbodyFranjasHorarias.innerHTML = html;

    dom.tbodyFranjasHorarias.querySelectorAll('.btn-eliminar-franja').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        state.horarioActual.splice(idx, 1);
        renderizarTablaHorario();
        actualizarResumenMedico();
        actualizarIndicadorCambiosPendientes();
      });
    });
  }

  function agregarFranjaHoraria() {
    if (!state.medicoSeleccionadoId) {
      notificar('warning', 'Seleccione primero un profesional médico.');
      return;
    }

    if (!dom.nuevaFranjaDia) dom.nuevaFranjaDia = document.getElementById('nuevaFranjaDia');
    if (!dom.nuevaFranjaHoraInicio) dom.nuevaFranjaHoraInicio = document.getElementById('nuevaFranjaHoraInicio');
    if (!dom.nuevaFranjaHoraFin) dom.nuevaFranjaHoraFin = document.getElementById('nuevaFranjaHoraFin');
    if (!dom.nuevaFranjaDuracion) dom.nuevaFranjaDuracion = document.getElementById('nuevaFranjaDuracion');

    const dia_semana = parseInt((dom.nuevaFranjaDia && dom.nuevaFranjaDia.value) || 1, 10) || 1;
    const hora_inicio = dom.nuevaFranjaHoraInicio ? dom.nuevaFranjaHoraInicio.value.trim() : '';
    const hora_fin = dom.nuevaFranjaHoraFin ? dom.nuevaFranjaHoraFin.value.trim() : '';
    const duracion_cita = parseInt((dom.nuevaFranjaDuracion && dom.nuevaFranjaDuracion.value) || 20, 10) || 20;

    if (!hora_inicio || !hora_fin) {
      notificar('warning', 'Indique tanto la hora de inicio como la hora de fin.');
      return;
    }

    if (hora_fin <= hora_inicio) {
      notificar('warning', 'La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }

    // Verificar si ya existe exactamente la misma franja o solapamiento en el mismo día
    const solapa = state.horarioActual.some((f) => {
      if (f.dia_semana !== dia_semana) return false;
      return !(hora_fin <= f.hora_inicio || hora_inicio >= f.hora_fin);
    });

    if (solapa) {
      notificar('warning', `Ya existe una franja que se cruza con este horario el día ${DIAS_SEMANA[dia_semana]}.`);
      return;
    }

    state.horarioActual.push({
      dia_semana,
      hora_inicio,
      hora_fin,
      duracion_cita,
    });

    renderizarTablaHorario();
    actualizarResumenMedico();
    actualizarIndicadorCambiosPendientes();
  }

  // --- Guardar Asignación N:M y Horario [13.38] ---
  async function guardarAsignacionYHorario() {
    if (!state.medicoSeleccionadoId) {
      notificar('warning', 'Seleccione un profesional médico antes de guardar.');
      return;
    }

    state.guardandoAsignacion = true;
    setBotonGuardarCargando(true);

    const medicoId = state.medicoSeleccionadoId;
    const especialidad_ids = state.especialidadesAsignadas.map((e) => e.id);

    try {
      // 1. Guardar asignación N:M
      await api(`/api/usuarios/${encodeURIComponent(medicoId)}/especialidades`, {
        method: 'POST',
        body: { especialidad_ids },
      });

      // 2. Guardar horario semanal
      await api(`/api/usuarios/${encodeURIComponent(medicoId)}/horario`, {
        method: 'PUT',
        body: state.horarioActual,
      });

      // Actualizar copias de respaldo para Cancelar
      state.especialidadesOriginales = JSON.parse(JSON.stringify(state.especialidadesAsignadas));
      state.horarioOriginal = JSON.parse(JSON.stringify(state.horarioActual));
      actualizarResumenMedico();
      actualizarIndicadorCambiosPendientes();

      window.HIS?.marcarFormularioLimpio?.();
      window.HIS?.anunciarCambio?.('Asignación de especialidades y horario semanal guardados.');
      notificar('success', 'Asignación de especialidades y horario semanal guardados exitosamente.');

      // Refrescar catálogo para actualizar contadores de médicos por especialidad [13.21]
      await cargarCatalogoEspecialidades(state.especialidadActivaDetalle ? state.especialidadActivaDetalle.id : null);

      // Si la especialidad activa en el detalle fue afectada, recargar sus profesionales
      if (state.especialidadActivaDetalle) {
        await cargarProfesionalesPorEspecialidad(state.especialidadActivaDetalle.id);
      }
    } catch (err) {
      console.error('Error al guardar asignación y horario:', err);
      notificar('danger', (err.datos && err.datos.mensaje) || err.message || 'Error al guardar la asignación.');
    } finally {
      state.guardandoAsignacion = false;
      setBotonGuardarCargando(false);
    }
  }

  function setBotonGuardarCargando(cargando) {
    if (!dom.btnGuardarAsignacion) return;
    dom.btnGuardarAsignacion.disabled = cargando;
    if (dom.loaderBtnGuardarAsignacion) {
      dom.loaderBtnGuardarAsignacion.classList.toggle('d-none', !cargando);
    }
    if (dom.textoBtnGuardarAsignacion) {
      dom.textoBtnGuardarAsignacion.textContent = cargando ? 'Guardando...' : 'Guardar asignación';
    }
  }

  // --- Cancelar Cambios de Asignación [13.37] ---
  function cancelarCambiosAsignacion() {
    if (!state.medicoSeleccionadoId) return;

    state.especialidadesAsignadas = JSON.parse(JSON.stringify(state.especialidadesOriginales));
    state.horarioActual = JSON.parse(JSON.stringify(state.horarioOriginal));

    renderizarChipsEspecialidades();
    renderizarTablaHorario();
    actualizarResumenMedico();
    actualizarIndicadorCambiosPendientes();
    notificar('info', 'Se restauró la configuración original del profesional.');
  }

  // --- Detalle Inferior: Profesionales por Especialidad [13.32 - 13.36] ---
  async function seleccionarEspecialidadDetalle(id, nombre) {
    state.especialidadActivaDetalle = { id, nombre };

    if (!dom.spanNombreEspecialidadSeleccionada) {
      dom.spanNombreEspecialidadSeleccionada = document.getElementById('spanNombreEspecialidadSeleccionada') || document.getElementById('nombreEspecialidadSeleccionada');
    }

    // Actualizar nombre en encabezado [13.32 / 13.35]
    if (dom.spanNombreEspecialidadSeleccionada) {
      dom.spanNombreEspecialidadSeleccionada.textContent = nombre;
    }

    if (!dom.tbodyEspecialidades) {
      dom.tbodyEspecialidades = document.getElementById('tbodyEspecialidades') || document.getElementById('listaEspecialidadesBody');
    }

    // Resaltar fila seleccionada en la tabla del catálogo
    if (dom.tbodyEspecialidades) {
      dom.tbodyEspecialidades.querySelectorAll('.fila-especialidad').forEach((f) => {
        const esSeleccionada = f.dataset.id === id;
        f.classList.toggle('table-primary', esSeleccionada);
        f.classList.toggle('table-active', esSeleccionada);
      });
    }

    await cargarProfesionalesPorEspecialidad(id);
  }

  async function cargarProfesionalesPorEspecialidad(especialidadId) {
    state.cargandoProfesionales = true;
    if (!dom.tbodyProfesionalesEspecialidad) {
      dom.tbodyProfesionalesEspecialidad = document.getElementById('tbodyProfesionalesEspecialidad') || document.getElementById('listaProfesionalesBody');
    }
    if (dom.tbodyProfesionalesEspecialidad) {
      dom.tbodyProfesionalesEspecialidad.innerHTML = `
        <tr>
          <td colspan="3" class="text-center py-4 text-muted small">
            <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
            Cargando profesionales asociados...
          </td>
        </tr>
      `;
    }

    try {
      const data = await api(`/api/especialidades/${encodeURIComponent(especialidadId)}/profesionales`);
      state.profesionalesPorEspecialidad = Array.isArray(data) ? data : (data.profesionales || data.filas || []);
      renderizarTablaProfesionalesEspecialidad();
    } catch (err) {
      console.error('Error al cargar profesionales por especialidad:', err);
      if (!dom.tbodyProfesionalesEspecialidad) {
        dom.tbodyProfesionalesEspecialidad = document.getElementById('tbodyProfesionalesEspecialidad') || document.getElementById('listaProfesionalesBody');
      }
      if (dom.tbodyProfesionalesEspecialidad) {
        dom.tbodyProfesionalesEspecialidad.innerHTML = `
          <tr>
            <td colspan="3" class="text-center py-4 text-danger small">
              No fue posible cargar los profesionales de esta especialidad.
            </td>
          </tr>
        `;
      }
    } finally {
      state.cargandoProfesionales = false;
    }
  }

  // Renderiza la tabla de profesionales por especialidad [13.33, 13.34, 13.36]
  function renderizarTablaProfesionalesEspecialidad() {
    if (!dom.tbodyProfesionalesEspecialidad) {
      dom.tbodyProfesionalesEspecialidad = document.getElementById('tbodyProfesionalesEspecialidad') || document.getElementById('listaProfesionalesBody');
    }
    if (!dom.tbodyProfesionalesEspecialidad) return;

    const lista = state.profesionalesPorEspecialidad;

    if (dom.badgeProfesionalesEspecialidadCount) {
      dom.badgeProfesionalesEspecialidadCount.textContent = `${lista.length} profesional${lista.length === 1 ? '' : 'es'}`;
    }

    if (lista.length === 0) {
      dom.tbodyProfesionalesEspecialidad.innerHTML = `
        <tr>
          <td colspan="3" class="text-center py-4 text-muted small fst-italic">
            No hay profesionales asignados a esta especialidad médica actualmente.
          </td>
        </tr>
      `;
      window.HIS?.anunciarCambio?.('Profesionales por especialidad actualizados: 0 encontrados.');
      return;
    }

    const html = lista
      .map((med) => {
        const fechaFormateada = formatearFechaDDMMAAAA(med.fecha_asignacion || med.fecha_creacion || '2024-01-15');
        const rolTexto = med.rol || 'MEDICO';

        return `
          <tr data-trace="C13-33">
            <td class="py-2 px-3">
              <div class="d-flex flex-column">
                <span class="fw-semibold text-dark">${escapeHtml(med.nombre)}</span>
                <span class="text-muted small">${escapeHtml(med.email || '')}</span>
              </div>
            </td>
            <td class="py-2 px-3">
              <span class="badge bg-primary-subtle text-primary border border-primary-subtle">
                ${escapeHtml(rolTexto)}
              </span>
            </td>
            <td class="py-2 px-3 text-muted small" data-trace="C13-36">
              ${escapeHtml(fechaFormateada)}
            </td>
          </tr>
        `;
      })
      .join('');

    dom.tbodyProfesionalesEspecialidad.innerHTML = html;
    window.HIS?.anunciarCambio?.(`Profesionales por especialidad actualizados: ${lista.length} encontrados.`);
  }

  // Exposición en el espacio de nombres global para pruebas y diagnóstico
  window.HIS_ESPECIALIDADES = {
    state,
    cargarCatalogo: cargarCatalogoEspecialidades,
    cargarMedicos,
    seleccionarMedico,
    agregarEspecialidadAMedico,
    removerEspecialidadDeMedico,
    agregarNuevaEspecialidad,
    guardarAsignacionYHorario,
    cancelarCambiosAsignacion,
    agregarFranjaHoraria,
    configurarEventos,
  };
})();
