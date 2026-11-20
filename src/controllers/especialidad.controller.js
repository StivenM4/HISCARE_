// src/controllers/especialidad.controller.js — controlador para Pantalla C.13 (Especialidades médicas y agendas)
const especialidadService = require('../services/especialidad.service');
const agendaService = require('../services/agenda.service');
const db = require('../db');
const { api } = require('../db/errores');

/**
 * Renderiza la interfaz de especialidades médicas y asignación a profesionales (C.13).
 * GET /admin/especialidades
 */
async function renderAdminEspecialidades(req, res, next) {
  try {
    return res.render('admin/especialidades', {
      titulo: 'Especialidades médicas y asignación a profesionales',
      rutaActual: '/admin/especialidades',
      moduloActivo: 'admin',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Retorna el catálogo completo de especialidades con conteo de médicos.
 * GET /api/especialidades
 */
const getEspecialidades = api(async (req, res) => {
  const especialidades = await especialidadService.listarEspecialidades();
  return res.json({
    ok: true,
    data: especialidades,
  });
});

/**
 * Crea una nueva especialidad médica.
 * POST /api/especialidades
 */
const postEspecialidad = api(async (req, res) => {
  const ctx = db.ctxDe(req);
  const nueva = await especialidadService.crearEspecialidad(req.body.nombre, ctx);
  return res.status(201).json({
    ok: true,
    data: nueva,
  });
});

/**
 * Actualiza el nombre de una especialidad médica existente.
 * PUT /api/especialidades/:id
 */
const putEspecialidad = api(async (req, res) => {
  const ctx = db.ctxDe(req);
  const editada = await especialidadService.actualizarEspecialidad(req.params.id, req.body.nombre, ctx);
  return res.status(200).json({
    ok: true,
    data: editada,
  });
});

/**
 * Retorna las especialidades asignadas a un usuario específico.
 * GET /api/usuarios/:id/especialidades
 */
const getUsuarioEspecialidades = api(async (req, res) => {
  const especialidades = await especialidadService.obtenerEspecialidadesUsuario(req.params.id);
  return res.json({
    ok: true,
    data: especialidades,
  });
});

/**
 * Asigna / sincroniza las especialidades asociadas a un médico.
 * POST /api/usuarios/:id/especialidades
 */
const postUsuarioEspecialidades = api(async (req, res) => {
  const ctx = db.ctxDe(req);
  const especialidadIds = req.body.especialidad_ids || [];
  await especialidadService.asignarEspecialidadesUsuario(ctx, req.params.id, especialidadIds);
  return res.json({
    ok: true,
    mensaje: 'Especialidades actualizadas',
  });
});

/**
 * Retorna los profesionales que tienen asignada una especialidad médica específica.
 * GET /api/especialidades/:id/profesionales
 */
const getProfesionalesPorEspecialidad = api(async (req, res) => {
  const profesionales = await especialidadService.obtenerProfesionalesPorEspecialidad(req.params.id);
  return res.json({
    ok: true,
    data: profesionales,
  });
});

/**
 * Consulta la configuración de horario semanal de un médico.
 * GET /api/usuarios/:id/horario
 */
const getHorarioMedico = api(async (req, res) => {
  const horarios = await agendaService.obtenerHorarioMedico(req.params.id);
  return res.json({
    ok: true,
    data: horarios,
  });
});

/**
 * Actualiza la configuración de horario semanal de un médico.
 * PUT /api/usuarios/:id/horario
 */
const putHorarioMedico = api(async (req, res) => {
  const ctx = db.ctxDe(req);
  const filas = Array.isArray(req.body)
    ? req.body
    : (req.body && Array.isArray(req.body.horario) ? req.body.horario : []);
  await agendaService.guardarHorarioMedico(ctx, req.params.id, filas);
  return res.json({
    ok: true,
    mensaje: 'Horario actualizado',
  });
});

/**
 * Retorna todos los médicos activos registrados en la institución.
 * GET /api/medicos
 */
const getMedicos = api(async (req, res) => {
  const medicos = await especialidadService.listarMedicos();
  return res.json({
    ok: true,
    data: medicos,
  });
});

module.exports = {
  renderAdminEspecialidades,
  getEspecialidades,
  postEspecialidad,
  putEspecialidad,
  getUsuarioEspecialidades,
  postUsuarioEspecialidades,
  getProfesionalesPorEspecialidad,
  getHorarioMedico,
  putHorarioMedico,
  getMedicos,
};
