// src/controllers/nota_alta.controller.js — Controlador para Pantalla C.21 (Nota de alta / epicrisis)
const db = require('../db');
const { traducir } = require('../db/errores');
const atencionService = require('../services/atencion.service');
const notaAltaService = require('../services/nota_alta.service');

/**
 * Renderiza la vista de la pestaña Nota de alta (Pantalla C.21).
 * GET /atenciones/:id/alta
 */
async function renderNotaAlta(req, res, next) {
  try {
    const ctx = db.ctxDe(req);
    let atencion = res.locals.atencion || req.atencion;

    try {
      const atencionCargada = await atencionService.cargar(req.params.id, ctx);
      if (atencionCargada) {
        atencion = atencionCargada;
      }
    } catch (_) {
      atencion = res.locals.atencion || req.atencion;
    }

    if (!atencion) {
      return res.status(404).render('errores/404', {
        titulo: 'Atención no encontrada',
        mensaje: 'La atención clínica solicitada no existe o no se encuentra disponible.',
        moduloActivo: 'atenciones',
      });
    }

    const usuario = req.session && req.session.usuario;
    const atencionId = atencion.id;

    // 1. Obtener nota existente si ya fue registrada
    const notaExistente = await notaAltaService.obtenerNotaAlta(atencionId, ctx);

    // 2. Obtener borrador si existe para este usuario y atención
    const borradorObj = usuario
      ? await notaAltaService.obtenerBorrador(usuario.id, atencionId, ctx)
      : null;
    const borrador = borradorObj ? (borradorObj.contenido || borradorObj) : null;

    // 3. Obtener resumen clínico precargado (diagnósticos, procedimientos, órdenes, resultados)
    const datosResumen = await atencionService.resumen(atencionId, ctx);

    // 4. Datos del médico para firma/autor
    const esAdmin = Boolean(usuario && usuario.rol === 'ADMINISTRADOR');
    let medico;
    if (notaExistente && notaExistente.medico) {
      medico = notaExistente.medico;
    } else if (usuario && (usuario.rol === 'MEDICO' || esAdmin)) {
      medico = {
        id: usuario.id,
        nombre: usuario.nombre,
        registro_medico: `RM-${usuario.id.slice(0, 6).toUpperCase()}`,
      };
    } else if (atencion.medico_id) {
      medico = {
        id: atencion.medico_id,
        nombre: atencion.medico_nombre || 'Médico tratante',
        registro_medico: `RM-${atencion.medico_id.slice(0, 6).toUpperCase()}`,
      };
    } else {
      medico = {
        nombre: 'Dra. Ana Pérez',
        registro_medico: 'RM-54219',
      };
    }

    const soloLectura = Boolean(
      res.locals.soloLectura !== undefined
        ? res.locals.soloLectura
        : (atencion.estado === 'CERRADA' ||
          (!esAdmin && usuario && usuario.rol === 'MEDICO' && atencion.medico_id && atencion.medico_id !== usuario.id))
    );

    return res.render('atencion/nota_alta', {
      titulo: 'Nota de alta (epicrisis)',
      atencion,
      nota: notaExistente,
      borrador,
      resumen: datosResumen,
      medico,
      soloLectura,
      figuraTrace: 'C21',
      seccion: 'alta',
      moduloActivo: 'atenciones',
      usuario,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Consulta del resumen clínico de la atención (diagnósticos, procedimientos, órdenes y resultados).
 * GET /api/atenciones/:id/resumen
 */
async function apiObtenerResumen(req, res, next) {
  try {
    const atencionId = req.params.id;
    if (!atencionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(atencionId)) {
      return res.status(404).json({
        ok: false,
        error: { codigo: 'NO_ENCONTRADO', mensaje: 'Atención clínica no encontrada' }
      });
    }
    const historiaService = require('../services/historia.service');
    const data = await historiaService.obtenerResumenAtencion(atencionId, db.ctxDe(req));
    if (!data) {
      return res.status(404).json({
        ok: false,
        error: { codigo: 'NO_ENCONTRADO', mensaje: 'Atención clínica no encontrada' }
      });
    }
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

/**
 * Guarda el borrador temporal de la nota de alta.
 * PUT /api/atenciones/:id/alta/borrador
 */
async function apiGuardarBorrador(req, res, next) {
  try {
    const atencion = req.atencion || res.locals.atencion;
    if (atencion && atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'ATENCION_CERRADA',
          mensaje: 'La atención está cerrada; no se pueden guardar borradores',
        },
      });
    }

    const usuario = req.session && req.session.usuario;
    if (!usuario) {
      return res.status(401).json({
        ok: false,
        error: { codigo: 'NO_AUTENTICADO', mensaje: 'Sesión no válida' },
      });
    }

    const esAdmin = Boolean(usuario && usuario.rol === 'ADMINISTRADOR');
    if (!esAdmin && usuario.rol === 'MEDICO' && atencion && atencion.medico_id && atencion.medico_id !== usuario.id) {
      return res.status(403).json({
        ok: false,
        error: { codigo: 'ACCESO_DENEGADO', mensaje: 'Solo el médico titular puede registrar borradores de alta' },
      });
    }

    const { resumen, recomendaciones } = req.body || {};
    await notaAltaService.guardarBorrador(
      usuario.id,
      req.params.id,
      { resumen, recomendaciones },
      db.ctxDe(req)
    );

    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

/**
 * Guarda definitivamente la nota de alta (epicrisis).
 * POST /api/atenciones/:id/alta
 */
async function apiGuardarNotaAlta(req, res, next) {
  try {
    const atencion = req.atencion || res.locals.atencion;
    if (atencion && atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'ATENCION_CERRADA',
          mensaje: 'HIS-E-07: la atencion esta cerrada; registre una adenda',
        },
      });
    }

    const usuario = req.session && req.session.usuario;
    const esAdmin = Boolean(usuario && usuario.rol === 'ADMINISTRADOR');
    if (!usuario || (!esAdmin && usuario.rol !== 'MEDICO')) {
      return res.status(403).json({
        ok: false,
        error: {
          codigo: 'ROL_NO_PERMITIDO',
          mensaje: 'Acción reservada a MEDICO',
        },
      });
    }

    if (!esAdmin && atencion && atencion.medico_id && atencion.medico_id !== usuario.id) {
      return res.status(403).json({
        ok: false,
        error: {
          codigo: 'ACCESO_DENEGADO',
          mensaje: 'Solo el médico titular puede registrar la nota de alta',
        },
      });
    }

    const { resumen, recomendaciones } = req.body || {};
    const nota = await notaAltaService.guardarNotaAlta(
      {
        atencionId: req.params.id,
        medicoId: usuario.id,
        resumen,
        recomendaciones,
      },
      db.ctxDe(req)
    );

    const status = nota && nota._esNuevo === false ? 200 : 201;
    return res.status(status).json({
      ok: true,
      data: nota,
    });
  } catch (err) {
    // Si la atención está cerrada o hay restricción de trigger P0001
    if (
      (err.status === 409 && (err.codigo === 'ATENCION_CERRADA' || err.codigo === 'CERRADA')) ||
      err.code === 'P0001' ||
      (err.message && (err.message.includes('cerrada') || err.message.includes('bloqueo') || err.message.includes('HIS-E-07')))
    ) {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'ATENCION_CERRADA',
          mensaje: err.message || 'La atención está cerrada; no se permiten modificaciones',
        },
      });
    }

    // Mapeo estricto de códigos PostgreSQL según especificación
    if (err.code === '23505') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'DUPLICADO',
          mensaje: 'Ya existe una nota de alta para esta atención',
        },
      });
    }

    if (err.code === '23P01') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CRUCE_HORARIO',
          mensaje: 'Conflicto de concurrencia temporal',
        },
      });
    }

    if (err.code === '23514') {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'FUERA_DE_RANGO',
          mensaje: 'Un valor no cumple las reglas permitidas',
        },
      });
    }

    if (err.code === '23503') {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'REFERENCIA_INVALIDA',
          mensaje: 'Se referencia un registro inexistente',
        },
      });
    }

    if (err.status) {
      return res.status(err.status).json({
        ok: false,
        error: {
          codigo: err.codigo || 'ERROR_OPERACION',
          mensaje: err.message,
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
  renderNotaAlta,
  vistaNotaAlta: renderNotaAlta,
  apiObtenerResumen,
  apiGuardarBorrador,
  apiGuardarNotaAlta,
};
