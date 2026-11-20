// src/controllers/auditoria.controller.js — controlador para Pantalla C.26 (Bitácora de auditoría forense y reportes de control)
const auditoriaService = require('../services/auditoria.service');
const { ctxDe } = require('../db');
const { traducir } = require('../db/errores');

/**
 * GET /auditoria
 * Renderiza la interfaz de auditoría forense y reportes de control (C.26).
 */
async function renderListado(req, res, next) {
  try {
    const catalogos = await auditoriaService.obtenerCatalogos();

    return res.render('auditoria/auditoria_listado', {
      titulo: 'Bitácora de auditoría forense y reportes de control',
      moduloActivo: 'auditoria',
      scripts: ['/js/auditoria.js'],
      usuarios: catalogos.usuarios,
      tablas: catalogos.tablas,
      acciones: catalogos.acciones,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auditoria
 * Retorna las filas de la bitácora con keyset pagination y el cursor 'siguiente'.
 */
async function getAuditoria(req, res, next) {
  try {
    const ctx = ctxDe(req);
    const resultado = await auditoriaService.consultar(req.query, ctx);

    return res.status(200).json({
      ok: true,
      data: {
        filas: resultado.filas,
        siguiente: resultado.siguiente,
      },
    });
  } catch (err) {
    const traducido = traducir(err);
    if (traducido) {
      return res.status(traducido.status).json({ ok: false, error: traducido.error });
    }
    return next(err);
  }
}

/**
 * GET /api/auditoria/:id
 * Retorna el detalle completo de un registro de auditoría por UUID.
 */
async function getDetalle(req, res, next) {
  try {
    const { id } = req.params;
    const ctx = ctxDe(req);
    const registro = await auditoriaService.obtenerDetalle(id, ctx);

    if (!registro) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'REGISTRO_NO_ENCONTRADO',
          mensaje: 'Registro de auditoría no encontrado',
        },
      });
    }

    return res.status(200).json({
      ok: true,
      data: registro,
    });
  } catch (err) {
    const traducido = traducir(err);
    if (traducido) {
      return res.status(traducido.status).json({ ok: false, error: traducido.error });
    }
    return next(err);
  }
}

/**
 * GET /api/auditoria/resumen
 * Retorna los indicadores acumulados del periodo consultado.
 */
async function getResumen(req, res, next) {
  try {
    const ctx = ctxDe(req);
    const metricas = await auditoriaService.resumen(req.query, ctx);

    return res.status(200).json({
      ok: true,
      data: {
        eventos: metricas.eventos,
        accesosHC: metricas.accesosHC,
        confidenciales: metricas.confidenciales,
        usuarios: metricas.usuarios,
      },
    });
  } catch (err) {
    const traducido = traducir(err);
    if (traducido) {
      return res.status(traducido.status).json({ ok: false, error: traducido.error });
    }
    return next(err);
  }
}

/**
 * GET /api/auditoria/exportar.csv
 * Exporta el reporte de auditoría en formato CSV en streaming.
 */
async function exportarCsv(req, res, next) {
  try {
    const ctx = ctxDe(req);
    await auditoriaService.exportar(req.query, res, ctx);
  } catch (err) {
    if (!res.headersSent) {
      const traducido = traducir(err);
      if (traducido) {
        return res.status(traducido.status).json({ ok: false, error: traducido.error });
      }
      return next(err);
    }
    console.error('Error durante el streaming CSV de auditoría:', err);
    res.end();
  }
}

module.exports = {
  renderListado,
  getAuditoria,
  getDetalle,
  getResumen,
  exportarCsv,
};
