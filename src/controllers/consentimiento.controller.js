// src/controllers/consentimiento.controller.js — Controlador de consentimientos informados (C.19)
const db = require('../db');
const { traducir } = require('../db/errores');
const atencionService = require('../services/atencion.service');
const consentimientoService = require('../services/consentimiento.service');
const { TIPOS_CONSENTIMIENTO } = require('../config/consentimientos');

/**
 * Renderiza la vista de consentimientos informados de la atención clínica (C.19).
 * GET /atenciones/:id/consentimientos
 */
async function renderConsentimientos(req, res, next) {
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
        mensaje: 'La atención clínica solicitada no existe.',
        moduloActivo: 'atenciones',
      });
    }

    const consentimientos = await consentimientoService.listarPorAtencion(atencion.id);
    const tipos = consentimientoService.obtenerTipos();

    const soloLectura = Boolean(
      res.locals.soloLectura !== undefined
        ? res.locals.soloLectura
        : (atencion.estado === 'CERRADA' || (req.session.usuario && req.session.usuario.rol === 'MEDICO' && atencion.medico_id !== req.session.usuario.id))
    );

    return res.render('atencion/consentimientos', {
      titulo: 'Consentimientos informados',
      seccion: 'consentimientos',
      figuraTrace: 'C19',
      consentimientos,
      tipos,
      TIPOS_CONSENTIMIENTO,
      atencion,
      soloLectura,
      moduloActivo: 'atenciones',
      usuario: req.session && req.session.usuario,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Listado de consentimientos de la atención en formato JSON.
 * GET /api/atenciones/:id/consentimientos
 */
async function apiListarConsentimientos(req, res, next) {
  try {
    const atencionId = req.params.id;
    const consentimientos = await consentimientoService.listarPorAtencion(atencionId);

    const data = (consentimientos || []).map((c) => ({
      id: c.id,
      tipo: c.tipo,
      descripcion: c.descripcion,
      fecha: c.fecha,
      firmado: c.firmado,
      firmado_por: c.firmado_por,
      fecha_formateada: c.fecha_formateada,
    }));

    return res.json({
      ok: true,
      data,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Creación de un nuevo consentimiento informado para la atención.
 * POST /api/atenciones/:id/consentimientos
 */
async function apiCrearConsentimiento(req, res, next) {
  try {
    const atencion = req.atencion || res.locals.atencion;
    if (atencion && atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CERRADA',
          mensaje: 'HIS-E-07: la atencion esta cerrada; no se pueden registrar consentimientos',
        },
      });
    }

    const ctx = db.ctxDe(req);
    const { tipo, descripcion, fecha, firmado, firmado_por } = req.body;

    const nuevoConsentimiento = await consentimientoService.crearConsentimiento(
      {
        atencionId: req.params.id,
        tipo,
        descripcion,
        fecha,
        firmado,
        firmado_por,
      },
      ctx
    );

    return res.status(201).json({
      ok: true,
      data: nuevoConsentimiento,
    });
  } catch (err) {
    if (
      err.status === 409 ||
      err.codigo === 'CERRADA' ||
      err.codigo === 'REGLA_DE_NEGOCIO' ||
      (err.code === 'P0001' && (err.message.includes('cerrada') || err.message.includes('bloqueo') || err.message.includes('HIS-E-07')))
    ) {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CERRADA',
          mensaje: err.message || 'La atención está cerrada',
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

/**
 * Firma un consentimiento informado existente.
 * PUT /api/atenciones/:id/consentimientos/:consentimientoId
 * POST /api/atenciones/:id/consentimientos/:consentimientoId/firmar
 */
async function apiFirmarConsentimiento(req, res, next) {
  try {
    const atencion = req.atencion || res.locals.atencion;
    if (atencion && atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CERRADA',
          mensaje: 'HIS-E-07: la atencion esta cerrada; no se pueden firmar consentimientos',
        },
      });
    }

    const ctx = db.ctxDe(req);
    const firmadoPor = req.body ? req.body.firmado_por : undefined;

    const actualizado = await consentimientoService.firmarConsentimiento(
      {
        atencionId: req.params.id,
        consentimientoId: req.params.consentimientoId,
        firmadoPor,
      },
      ctx
    );

    if (!actualizado) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'CONSENTIMIENTO_NO_ENCONTRADO',
          mensaje: 'Consentimiento informado no encontrado en esta atención',
        },
      });
    }

    return res.status(200).json({
      ok: true,
      data: actualizado,
    });
  } catch (err) {
    if (
      err.status === 409 ||
      err.codigo === 'CERRADA' ||
      err.codigo === 'REGLA_DE_NEGOCIO' ||
      (err.code === 'P0001' && (err.message.includes('cerrada') || err.message.includes('bloqueo') || err.message.includes('HIS-E-07')))
    ) {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CERRADA',
          mensaje: err.message || 'La atención está cerrada',
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

/**
 * Catálogo de tipos de consentimiento en formato JSON (array de strings).
 * GET /api/consentimientos/tipos
 */
async function apiObtenerTipos(req, res, next) {
  try {
    const tipos = consentimientoService.obtenerTipos();
    return res.json({
      ok: true,
      data: tipos,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  renderConsentimientos,
  apiListarConsentimientos,
  apiCrearConsentimiento,
  apiFirmarConsentimiento,
  apiObtenerTipos,
};

