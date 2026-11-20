// src/controllers/integracion.controller.js — Controlador para pantalla C.23 (Despacho de órdenes e interoperabilidad)
const envioService = require('../services/envio.service');
const { ctxDe } = require('../db');
const { NoEncontrado, Conflicto } = require('../db/errores');

/**
 * GET /ordenes/integraciones
 * Renderiza la vista de monitoreo de integraciones y despacho a sistemas externos (C.23).
 */
async function renderIntegraciones(req, res, next) {
  try {
    const orden = req.query.orden || '';
    const estado = req.query.estado || '';

    const [resumen, resultado] = await Promise.all([
      envioService.obtenerResumen(),
      envioService.listarIntegraciones({ estado, orden, page: 1, limite: 20 })
    ]);

    return res.render('ordenes/integraciones', {
      titulo: 'Seguimiento de despacho a sistemas externos',
      figuraTrace: 'C23',
      moduloActivo: 'ordenes',
      filtroOrden: orden,
      filtroEstado: estado,
      resumen,
      integraciones: resultado.filas,
      total: resultado.total,
      pagina: resultado.page,
      totalPaginas: resultado.totalPaginas,
      usuario: req.session ? req.session.usuario : null,
      scripts: ['/js/integraciones.js']
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/integraciones/resumen
 * Retorna las métricas de despacho agrupadas por estado (ENVIADO, PENDIENTE, REINTENTO, ERROR).
 */
async function apiResumen(req, res, next) {
  try {
    const resumen = await envioService.obtenerResumen();
    return res.json({
      ok: true,
      data: resumen
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/integraciones
 * Retorna la lista paginada y filtrada de registros de integración.
 */
async function apiListar(req, res, next) {
  try {
    const { estado, orden, page, limite } = req.query;

    const resultado = await envioService.listarIntegraciones({
      estado,
      orden,
      page,
      limite
    });

    return res.json({
      ok: true,
      data: resultado.filas,
      meta: {
        total: resultado.total,
        page: resultado.page,
        limite: resultado.limite,
        totalPaginas: resultado.totalPaginas
      }
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/integraciones/:id
 * Retorna el detalle completo de un registro de integración por su UUID.
 */
async function apiDetalle(req, res, next) {
  try {
    const { id } = req.params;
    const detalle = await envioService.obtenerDetalle(id);
    return res.json({
      ok: true,
      data: detalle
    });
  } catch (err) {
    if (
      err instanceof NoEncontrado ||
      err.status === 404 ||
      err.codigo === 'NO_ENCONTRADO'
    ) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'NO_ENCONTRADO',
          mensaje: err.message || 'Integración no encontrada'
        }
      });
    }
    return next(err);
  }
}

/**
 * POST /api/integraciones/:id/reenviar
 * Permite el reenvío manual de una orden rechazada o en estado ERROR (solo ADMINISTRADOR).
 * Retorna HTTP 202 si se encoló correctamente, o 409 si el estado no es ERROR.
 */
async function apiReenviar(req, res, next) {
  try {
    const { id } = req.params;
    const ctx = ctxDe(req);

    const reenviada = await envioService.reenviar(id, ctx);

    return res.status(202).json({
      ok: true,
      mensaje: 'Orden encolada para reenvío',
      data: reenviada
    });
  } catch (err) {
    if (
      err instanceof Conflicto ||
      err.status === 409 ||
      err.codigo === 'CONFLICTO'
    ) {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: err.codigo || 'CONFLICTO',
          mensaje: err.message
        }
      });
    }
    if (
      err instanceof NoEncontrado ||
      err.status === 404 ||
      err.codigo === 'NO_ENCONTRADO'
    ) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'NO_ENCONTRADO',
          mensaje: err.message || 'Integración no encontrada'
        }
      });
    }
    return next(err);
  }
}

module.exports = {
  renderIntegraciones,
  apiResumen,
  apiListar,
  apiDetalle,
  apiReenviar
};
