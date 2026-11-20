// src/controllers/aseguradora.controller.js — controlador para Pantalla C.14 (Catálogo de EPS y aseguradoras)
const aseguradoraService = require('../services/aseguradora.service');
const db = require('../db');
const { api } = require('../db/errores');

/**
 * Renderiza la vista de administración del catálogo de aseguradoras (C.14).
 * GET /admin/aseguradoras
 */
async function renderAdminAseguradoras(req, res, next) {
  try {
    return res.render('admin/aseguradoras', {
      titulo: 'Catálogo de EPS y entidades aseguradoras',
      rutaActual: '/admin/aseguradoras',
      moduloActivo: 'admin',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Retorna el catálogo de aseguradoras con soporte para filtros de búsqueda y estado.
 * GET /api/aseguradoras
 */
const getAsuguradoras = api(async (req, res) => {
  const todas = req.query.todas === 'true' || req.query.todas === '1';
  const aseguradoras = await aseguradoraService.listarAseguradoras({
    q: req.query.q,
    tipo_plan: req.query.tipo_plan,
    todas,
  });

  return res.json({
    ok: true,
    data: aseguradoras,
  });
});

/**
 * Retorna una entidad aseguradora por su identificador único UUID.
 * GET /api/aseguradoras/:id
 */
const getAsuguradoraPorId = api(async (req, res) => {
  const data = await aseguradoraService.obtenerAseguradoraPorId(req.params.id);
  return res.json({
    ok: true,
    data,
  });
});

/**
 * Registra una nueva aseguradora en el sistema dentro de una transacción con auditoría.
 * POST /api/aseguradoras
 */
const postAseguradora = api(async (req, res) => {
  const ctx = db.ctxDe(req);
  const data = await aseguradoraService.crearAseguradora(req.body, ctx);
  return res.status(201).json({
    ok: true,
    data,
  });
});

/**
 * Actualiza la información de una aseguradora existente.
 * PUT /api/aseguradoras/:id
 */
const putAseguradora = api(async (req, res) => {
  const ctx = db.ctxDe(req);
  const data = await aseguradoraService.actualizarAseguradora(req.params.id, req.body, ctx);
  return res.status(200).json({
    ok: true,
    data,
  });
});

/**
 * Modifica el estado activo/inactivo (vigente/no vigente) de una aseguradora.
 * PATCH /api/aseguradoras/:id/estado
 */
const patchEstadoAseguradora = api(async (req, res) => {
  const ctx = db.ctxDe(req);
  const activo = req.body.activo === true || req.body.activo === 'true' || req.body.activo === 1 || req.body.activo === '1';
  const data = await aseguradoraService.cambiarEstadoAseguradora(req.params.id, activo, ctx);
  return res.status(200).json({
    ok: true,
    data,
  });
});

/**
 * Elimina una aseguradora del catálogo si no tiene afiliaciones asociadas.
 * DELETE /api/aseguradoras/:id
 */
const deleteAseguradora = api(async (req, res) => {
  const ctx = db.ctxDe(req);
  await aseguradoraService.eliminarAseguradora(req.params.id, ctx);
  return res.status(200).json({
    ok: true,
    mensaje: 'Aseguradora eliminada',
  });
});

module.exports = {
  renderAdminAseguradoras,
  getAsuguradoras,
  getAsignaturas: getAsuguradoras,
  getAsuguradoraPorId,
  postAseguradora,
  putAseguradora,
  patchEstadoAseguradora,
  deleteAseguradora,
};
