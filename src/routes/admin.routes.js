// src/routes/admin.routes.js — rutas para administración (C.12 Usuarios y C.13 Especialidades y Agendas)
const router = require('express').Router();
const { sesion, autorizar } = require('../middlewares/seguridad');
const {
  usuarioCrearRules,
  usuarioEditarRules,
  usuarioEstadoRules,
  validar: validarUsuario,
} = require('../validators/usuario.validator');
const {
  especialidadCrearRules,
  especialidadEditarRules,
  especialidadAsignarRules,
  horarioGuardarRules,
  validar: validarEspecialidad,
} = require('../validators/especialidad.validator');
const usuarioController = require('../controllers/usuario.controller');
const especialidadController = require('../controllers/especialidad.controller');

// =====================================================================
// PANTALLA C.12: Administración de usuarios y roles (HIS-F-01, HIS-F-02)
// =====================================================================

// Vista de administración de usuarios y roles
router.get(
  '/admin/usuarios',
  sesion,
  autorizar('admin', 'L'),
  usuarioController.renderAdminUsuarios
);

// Directorio de usuarios vía API (búsqueda y paginación)
router.get(
  '/api/usuarios',
  sesion,
  autorizar('admin', 'L'),
  usuarioController.getUsuarios
);

// Catálogo de roles
router.get(
  '/api/roles',
  sesion,
  autorizar('admin', 'L'),
  usuarioController.getRoles
);

// Creación de usuario institucional
router.post(
  '/api/usuarios',
  sesion,
  autorizar('admin', 'E'),
  validarUsuario(usuarioCrearRules),
  usuarioController.postUsuario
);

// Modificación de datos de usuario
router.put(
  '/api/usuarios/:id',
  sesion,
  autorizar('admin', 'E'),
  validarUsuario(usuarioEditarRules),
  usuarioController.putUsuario
);

// Cambio de estado activo/inactivo (con revocación de sesiones al desactivar)
router.patch(
  '/api/usuarios/:id/estado',
  sesion,
  autorizar('admin', 'E'),
  validarUsuario(usuarioEstadoRules),
  usuarioController.patchEstado
);

// Matriz de permisos RBAC del sistema
router.get(
  '/api/permisos',
  sesion,
  autorizar('admin', 'L'),
  usuarioController.getPermisos
);

// =====================================================================
// PANTALLA C.13: Especialidades médicas y asignación N:M (HIS-F-03, SEG-05)
// =====================================================================

// Vista de administración de especialidades y asignación a profesionales
router.get(
  '/admin/especialidades',
  sesion,
  autorizar('admin', 'L'),
  especialidadController.renderAdminEspecialidades
);

// Catálogo de especialidades con conteo de médicos
router.get(
  '/api/especialidades',
  sesion,
  especialidadController.getEspecialidades
);

// Creación de nueva especialidad
router.post(
  '/api/especialidades',
  sesion,
  autorizar('admin', 'E'),
  validarEspecialidad(especialidadCrearRules),
  especialidadController.postEspecialidad
);

// Edición de nombre de especialidad
router.put(
  '/api/especialidades/:id',
  sesion,
  autorizar('admin', 'E'),
  validarEspecialidad(especialidadEditarRules),
  especialidadController.putEspecialidad
);

// Consulta de profesionales asignados a una especialidad
router.get(
  '/api/especialidades/:id/profesionales',
  sesion,
  autorizar('admin', 'L'),
  especialidadController.getProfesionalesPorEspecialidad
);

// Listado de profesionales con rol MEDICO para asignación
router.get(
  '/api/medicos',
  sesion,
  autorizar('admin', 'L'),
  especialidadController.getMedicos
);

// Consulta de especialidades asignadas a un usuario
router.get(
  '/api/usuarios/:id/especialidades',
  sesion,
  autorizar('admin', 'L'),
  especialidadController.getUsuarioEspecialidades
);

// Asignación / sincronización de especialidades para un médico
router.post(
  '/api/usuarios/:id/especialidades',
  sesion,
  autorizar('admin', 'E'),
  validarEspecialidad(especialidadAsignarRules),
  especialidadController.postUsuarioEspecialidades
);

// Consulta de horario semanal de un médico
router.get(
  '/api/usuarios/:id/horario',
  sesion,
  autorizar('admin', 'L'),
  especialidadController.getHorarioMedico
);

// Guardado de configuración de horario semanal de un médico
router.put(
  '/api/usuarios/:id/horario',
  sesion,
  autorizar('admin', 'E'),
  validarEspecialidad(horarioGuardarRules),
  especialidadController.putHorarioMedico
);

module.exports = router;
