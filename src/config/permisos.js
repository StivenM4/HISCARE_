// src/config/permisos.js — matriz RBAC (L = leer, E = escribir) y menú por rol

const ICONOS = {
  inicio: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-house me-2" viewBox="0 0 16 16"><path d="M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.646.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293zM13 7.207V13.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V7.207l5-5z"/></svg>`,
  agenda: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-calendar-event me-2" viewBox="0 0 16 16"><path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z"/><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/></svg>`,
  pacientes: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-people me-2" viewBox="0 0 16 16"><path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1zm-7.978-1L7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002-.014.002zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6.936 9.28a6 6 0 0 0-1.23-.247A7 7 0 0 0 5 9c-4 0-5 3-5 4q0 1 1 1h4.216A2.24 2.24 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816M4.92 10A5.5 5.5 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275ZM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0m3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/></svg>`,
  atenciones: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard2-pulse me-2" viewBox="0 0 16 16"><path d="M9.5 0a.5.5 0 0 1 .5.5.5.5 0 0 0 .5.5.5.5 0 0 1 .5.5V2a.5.5 0 0 1-.5.5h-5A.5.5 0 0 1 5 2v-.5a.5.5 0 0 1 .5-.5.5.5 0 0 0 .5-.5.5.5 0 0 1 .5-.5z"/><path d="M3 2.5a.5.5 0 0 1 .5-.5H4a1.5 1.5 0 0 0 1.4-1H6a.5.5 0 0 1 0 1h-.5a.5.5 0 0 0-.5.5V3h6v-.5a.5.5 0 0 0-.5-.5H10a.5.5 0 0 1 0-1h.6a1.5 1.5 0 0 0 1.4 1h.5a.5.5 0 0 1 .5.5v12a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5zM9.979 9.356a.5.5 0 0 0-.968.04L8.32 11.79l-1.315-3.288a.5.5 0 0 0-.94-.034L5.279 10.5H3.5a.5.5 0 0 0 0 1h2a.5.5 0 0 0 .47-.329l.488-1.303 1.366 3.414a.5.5 0 0 0 .945-.016l.72-2.399.65 1.157a.5.5 0 0 0 .868-.027l1.5-2.5a.5.5 0 1 0-.858-.515z"/></svg>`,
  historias: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-journal-medical me-2" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 4a.5.5 0 0 1 .5.5v.634l.549-.317a.5.5 0 1 1 .5.866L9 6l.549.317a.5.5 0 1 1-.5.866L8.5 6.866V7.5a.5.5 0 0 1-1 0v-.634l-.549.317a.5.5 0 1 1-.5-.866L7 6l-.549-.317a.5.5 0 0 1 .5-.866l.549.317V4.5A.5.5 0 0 1 8 4M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1h1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v1H1V2a2 2 0 0 1 2-2"/><path d="M1 5v-.5a.5.5 0 0 1 1 0V5h.5a.5.5 0 0 1 0 1H2v1h.5a.5.5 0 0 1 0 1H2v1h.5a.5.5 0 0 1 0 1H2v1h.5a.5.5 0 0 1 0 1H2v.5a.5.5 0 0 1-1 0V11H.5a.5.5 0 0 1 0-1H1V9H.5a.5.5 0 0 1 0-1H1V7H.5a.5.5 0 0 1 0-1H1z"/></svg>`,
  ordenes: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-earmark-medical me-2" viewBox="0 0 16 16"><path d="M7.5 5.5a.5.5 0 0 0-1 0v.634l-.549-.317a.5.5 0 0 0-.5.866L6 7l-.549.317a.5.5 0 0 0 .5.866l.549-.317V8.5a.5.5 0 1 0 1 0v-.634l.549.317a.5.5 0 1 0 .5-.866L8 7l.549-.317a.5.5 0 1 0-.5-.866l-.549.317z"/><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5z"/></svg>`,
  resultados: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard2-check me-2" viewBox="0 0 16 16"><path d="M9.5 0a.5.5 0 0 1 .5.5.5.5 0 0 0 .5.5.5.5 0 0 1 .5.5V2a.5.5 0 0 1-.5.5h-5A.5.5 0 0 1 5 2v-.5a.5.5 0 0 1 .5-.5.5.5 0 0 0 .5-.5.5.5 0 0 1 .5-.5z"/><path d="M3 2.5a.5.5 0 0 1 .5-.5H4a1.5 1.5 0 0 0 1.4-1H6a.5.5 0 0 1 0 1h-.5a.5.5 0 0 0-.5.5V3h6v-.5a.5.5 0 0 0-.5-.5H10a.5.5 0 0 1 0-1h.6a1.5 1.5 0 0 0 1.4 1h.5a.5.5 0 0 1 .5.5v12a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5zM10.854 7.854a.5.5 0 0 0-.708-.708L7.5 9.793 6.354 8.646a.5.5 0 1 0-.708.708l1.5 1.5a.5.5 0 0 0 .708 0z"/></svg>`,
  auditoria: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-shield-check me-2" viewBox="0 0 16 16"><path d="M5.338 1.59a61 61 0 0 0-2.837.856.48.48 0 0 0-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.7 10.7 0 0 0 2.287 2.233c.346.244.652.42.893.533q.18.085.293.134a.47.47 0 0 0 .197.042c.07 0 .138-.014.197-.042a4 4 0 0 0 .293-.134 11 11 0 0 0 .893-.533 10.7 10.7 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067c-.53 0-1.552.223-2.662.524zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.8 11.8 0 0 1-2.517 2.453 7 7 0 0 1-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7 7 0 0 1-1.048-.625 11.8 11.8 0 0 1-2.517-2.453C1.928 10.487.545 7.169 1.141 2.692A1.54 1.54 0 0 1 2.185 1.43 63 63 0 0 1 5.072.56"/><path d="M10.854 5.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 7.793l2.646-2.647a.5.5 0 0 1 .708 0"/></svg>`,
  admin: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-gear me-2" viewBox="0 0 16 16"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.185 1.184l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.185l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/></svg>`,
};

const ROLES = ['ADMINISTRADOR', 'MEDICO', 'RECEPCIONISTA', 'ENFERMERO', 'AUDITOR'];

const modulos = {
  inicio:     { ruta: '/inicio',         nombre: 'Inicio',           icono: ICONOS.inicio,     roles: { '*': ['L'], ADMINISTRADOR: ['L', 'E'] } },
  agenda:     { ruta: '/agenda',         nombre: 'Agenda',           icono: ICONOS.agenda,     roles: { MEDICO: ['L', 'E'], RECEPCIONISTA: ['L', 'E'], ENFERMERO: ['L', 'E'], ADMINISTRADOR: ['L', 'E'] } },
  pacientes:  { ruta: '/pacientes',      nombre: 'Pacientes',        icono: ICONOS.pacientes,  roles: { RECEPCIONISTA: ['L', 'E'], MEDICO: ['L'], ENFERMERO: ['L'], ADMINISTRADOR: ['L', 'E'] } },
  atenciones: { ruta: '/atenciones',     nombre: 'Atención clínica', icono: ICONOS.atenciones, roles: { MEDICO: ['L', 'E'], ENFERMERO: ['L', 'E'], ADMINISTRADOR: ['L', 'E'] } },
  historias:  { ruta: '/historias',      nombre: 'Historia clínica', icono: ICONOS.historias,  menu: false, roles: { MEDICO: ['L', 'E'], ENFERMERO: ['L', 'E'], AUDITOR: ['L'], ADMINISTRADOR: ['L', 'E'] } },
  ordenes:    { ruta: '/ordenes',        nombre: 'Órdenes',          icono: ICONOS.ordenes,    roles: { MEDICO: ['L', 'E'], RECEPCIONISTA: ['L'], ENFERMERO: ['L'], ADMINISTRADOR: ['L', 'E'] } },
  resultados: { ruta: '/resultados',     nombre: 'Resultados',       icono: ICONOS.resultados, roles: { MEDICO: ['L', 'E'], ENFERMERO: ['L', 'E'], AUDITOR: ['L'], ADMINISTRADOR: ['L', 'E'] } },
  auditoria:  { ruta: '/auditoria',      nombre: 'Auditoría',        icono: ICONOS.auditoria,  roles: { AUDITOR: ['L', 'E'], ADMINISTRADOR: ['L', 'E'] } },
  admin:      { ruta: '/admin/usuarios', nombre: 'Administración',   icono: ICONOS.admin,      roles: { ADMINISTRADOR: ['L', 'E'] } },
};

const inicioPorRol = {
  ADMINISTRADOR: '/admin/usuarios',
  MEDICO: '/agenda',
  RECEPCIONISTA: '/pacientes',
  ENFERMERO: '/agenda',
  AUDITOR: '/auditoria',
};

function puede(rol, modulo, accion) {
  if (rol === 'ADMINISTRADOR') return true;
  const m = modulos[modulo];
  if (!m) return false;
  const acciones = m.roles[rol] || m.roles['*'] || [];
  return acciones.includes(accion);
}

const menuPorRol = (rol) =>
  Object.entries(modulos)
    .filter(([clave, m]) => m.menu !== false && puede(rol, clave, 'L'))
    .map(([clave, m]) => ({
      clave,
      ruta: m.ruta,
      nombre: m.nombre,
      icono: m.icono,
    }));

const ACCESOS_RAPIDOS = [
  {
    clave: 'nueva_cita',
    titulo: 'Nueva cita',
    descripcion: 'Seleccionar paciente para agendar una cita médica',
    ruta: '/pacientes?accion=nueva-cita',
    modulo: 'agenda',
    accion: 'E',
    variante: 'primary',
  },
  {
    clave: 'agenda',
    titulo: 'Agenda médica',
    descripcion: 'Consultar citas y sala de espera del día',
    ruta: '/agenda',
    modulo: 'agenda',
    accion: 'L',
    variante: 'info',
  },
  {
    clave: 'registrar_paciente',
    titulo: 'Registrar paciente',
    descripcion: 'Crear ficha de ingreso de paciente',
    ruta: '/pacientes/nuevo',
    modulo: 'pacientes',
    accion: 'E',
    variante: 'success',
  },
  {
    clave: 'pacientes',
    titulo: 'Buscar pacientes',
    descripcion: 'Consultar listado e historia de pacientes',
    ruta: '/pacientes',
    modulo: 'pacientes',
    accion: 'L',
    variante: 'secondary',
  },
  {
    clave: 'atenciones',
    titulo: 'Atención clínica',
    descripcion: 'Gestionar consultas y evoluciones en curso',
    ruta: '/atenciones',
    modulo: 'atenciones',
    accion: 'L',
    variante: 'primary',
  },
  {
    clave: 'ordenes',
    titulo: 'Órdenes médicas',
    descripcion: 'Seguimiento de órdenes diagnósticas',
    ruta: '/ordenes',
    modulo: 'ordenes',
    accion: 'L',
    variante: 'warning',
  },
  {
    clave: 'resultados',
    titulo: 'Resultados',
    descripcion: 'Consultar resultados de exámenes y estudios',
    ruta: '/resultados',
    modulo: 'resultados',
    accion: 'L',
    variante: 'info',
  },
  {
    clave: 'auditoria',
    titulo: 'Auditoría',
    descripcion: 'Revisar trazabilidad y eventos del sistema',
    ruta: '/auditoria',
    modulo: 'auditoria',
    accion: 'L',
    variante: 'dark',
  },
  {
    clave: 'admin',
    titulo: 'Administración',
    descripcion: 'Gestionar usuarios, roles y catálogos',
    ruta: '/admin/usuarios',
    modulo: 'admin',
    accion: 'L',
    variante: 'secondary',
  },
];

/**
 * Retorna las tarjetas de acceso rápido del dashboard de Inicio filtradas estrictamente por RBAC.
 */
const accesosRapidosPorRol = (rol) =>
  ACCESOS_RAPIDOS
    .filter((item) => puede(rol, item.modulo, item.accion))
    .map((item) => ({ ...item }));

/**
 * Retorna la matriz estructurada para endpoints /api/permisos y paneles de visualización.
 */
function obtenerMatriz() {
  return {
    modulos,
    roles: ROLES,
  };
}

module.exports = {
  modulos,
  inicioPorRol,
  puede,
  menuPorRol,
  accesosRapidosPorRol,
  ICONOS,
  ROLES,
  obtenerMatriz,
};
