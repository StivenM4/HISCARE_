// src/controllers/codificacion.controller.js — Controlador para Pantalla C.20 (Codificación CIE-10 y CUPS)
const db = require('../db');
const { traducir } = require('../db/errores');
const atencionService = require('../services/atencion.service');
const catalogoService = require('../services/catalogo.service');
const codificacionService = require('../services/codificacion.service');

/**
 * Renderiza la vista principal de la pestaña Diagnósticos y Procedimientos (Pantalla C.20).
 * GET /atenciones/:id/diagnosticos
 */
async function renderDiagnosticos(req, res, next) {
  try {
    const ctx = db.ctxDe(req);
    let atencion = res.locals.atencion;

    try {
      const atencionCargada = await atencionService.cargar(req.params.id, ctx);
      if (atencionCargada) {
        atencion = atencionCargada;
      }
    } catch (_) {
      atencion = res.locals.atencion || req.atencion;
    }

    if (!atencion) {
      atencion = res.locals.atencion || req.atencion;
    }

    if (!atencion) {
      return res.status(404).render('errores/404', {
        titulo: 'Atención no encontrada',
        mensaje: 'La atención clínica solicitada no existe o no se encuentra disponible.',
        moduloActivo: 'atenciones',
      });
    }

    const soloLectura = Boolean(
      res.locals.soloLectura !== undefined
        ? res.locals.soloLectura
        : (atencion.estado === 'CERRADA' ||
          (req.session.usuario && req.session.usuario.rol === 'MEDICO' && atencion.medico_id && atencion.medico_id !== req.session.usuario.id))
    );

    const { diagnosticos, procedimientos } = await codificacionService.obtenerCodificacion(atencion.id);

    return res.render('atencion/diagnosticos', {
      titulo: 'Codificación CIE-10 y Procedimientos CUPS',
      atencion,
      soloLectura,
      diagnosticos,
      procedimientos,
      figuraTrace: 'C20',
      seccion: 'diagnosticos',
      moduloActivo: 'atenciones',
      usuario: req.session && req.session.usuario,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Búsqueda predictiva en catálogo CIE-10.
 * GET /api/cie10/buscar?q=...
 */
async function apiBuscarCie10(req, res, next) {
  try {
    const q = req.query.q || '';
    const data = await catalogoService.buscarCie10(q);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

/**
 * Búsqueda predictiva en catálogo CUPS.
 * GET /api/cups/buscar?q=...
 */
async function apiBuscarCups(req, res, next) {
  try {
    const q = req.query.q || '';
    const data = await catalogoService.buscarCups(q);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

/**
 * Obtiene la codificación actual de una atención.
 * GET /api/atenciones/:id/codificacion
 */
async function apiObtenerCodificacion(req, res, next) {
  try {
    const data = await codificacionService.obtenerCodificacion(req.params.id);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

/**
 * Guarda la codificación diagnóstica y procedimental de una atención (Pantalla C.20).
 * POST /api/atenciones/:id/codificacion
 */
async function apiGuardarCodificacion(req, res, next) {
  try {
    const atencion = req.atencion || res.locals.atencion;
    if (!atencion) {
      return res.status(404).json({
        ok: false,
        error: { codigo: 'ATENCION_NO_ENCONTRADA', mensaje: 'Atención no encontrada' },
      });
    }

    if (atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CERRADA',
          mensaje: 'HIS-E-07: la atencion esta cerrada; registre una adenda',
        },
      });
    }

    const usuario = req.session && req.session.usuario;
    if (usuario && usuario.rol === 'MEDICO' && atencion.medico_id && atencion.medico_id !== usuario.id) {
      return res.status(403).json({
        ok: false,
        error: {
          codigo: 'ACCESO_DENEGADO',
          mensaje: 'Solo el médico titular puede registrar modificaciones',
        },
      });
    }

    const ctx = db.ctxDe(req);
    await codificacionService.guardarCodificacion(req.params.id, req.body, ctx);
    return res.json({ ok: true, mensaje: 'Codificación guardada exitosamente' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        ok: false,
        error: {
          codigo: err.codigo || 'ERROR_OPERACION',
          mensaje: err.message,
          campos: err.campos || [],
        },
      });
    }
    const t = traducir(err);
    if (t) {
      return res.status(t.status).json({ ok: false, error: t.error });
    }
    return next(err);
  }
}

module.exports = {
  renderDiagnosticos,
  apiBuscarCie10,
  apiBuscarCups,
  apiObtenerCodificacion,
  apiGuardarCodificacion,
};
