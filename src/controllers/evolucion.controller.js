// src/controllers/evolucion.controller.js — controlador para la pestaña Evolución SOAP (C.6)
const db = require('../db');
const { traducir } = require('../db/errores');
const atencionService = require('../services/atencion.service');
const evolucionService = require('../services/evolucion.service');

/**
 * Renderiza la pestaña Evolución SOAP (C.6).
 * GET /atenciones/:id/evolucion
 */
async function renderEvolucion(req, res, next) {
  try {
    const ctx = db.ctxDe(req);
    let atencion = null;

    try {
      atencion = await atencionService.cargar(req.params.id, ctx);
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

    const usuario = req.session && req.session.usuario;
    const atencionId = atencion.id;

    // 1. Obtener última toma de signos vitales
    const ultimaToma = await evolucionService.obtenerUltimaToma(atencionId, ctx);

    // 2. Obtener lista histórica de evoluciones firmadas
    const evoluciones = await evolucionService.listarEvoluciones(atencionId, ctx);

    // 3. Obtener borrador guardado en servidor para la sección SOAP
    const borrador = usuario
      ? await evolucionService.obtenerBorrador(usuario.id, atencionId, ctx)
      : null;

    // 4. Determinar permisos y estado de edición
    const esAdmin = Boolean(usuario && usuario.rol === 'ADMINISTRADOR');
    const soloLectura = Boolean(
      res.locals.soloLectura ||
      atencion.estado === 'CERRADA' ||
      !usuario ||
      (!esAdmin && (usuario.rol !== 'MEDICO' || atencion.medico_id !== usuario.id))
    );

    const puedeEditar = Boolean(
      usuario &&
      atencion.estado !== 'CERRADA' &&
      (esAdmin || (usuario.rol === 'MEDICO' && atencion.medico_id === usuario.id))
    );

    return res.render('atencion/evolucion_soap', {
      titulo: 'Evolución SOAP',
      atencion,
      ultimaToma,
      evoluciones,
      borrador: borrador ? borrador.contenido : null,
      soloLectura,
      puedeEditar,
      seccion: 'evolucion',
      figuraTrace: 'C6',
      moduloActivo: 'atenciones',
      usuario,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Consulta de signos vitales (GET /api/atenciones/:id/signos).
 * Si ?ultima=1 retorna la última toma registrada, si no retorna todas las tomas.
 */
async function apiSignos(req, res, next) {
  try {
    const atencionId = req.params.id;
    const ctx = db.ctxDe(req);

    if (req.query.ultima === '1') {
      const toma = await evolucionService.obtenerUltimaToma(atencionId, ctx);
      return res.json({ ok: true, data: toma || null });
    }

    const lista = await evolucionService.listarSignos(atencionId, ctx);
    return res.json({ ok: true, data: lista || [] });
  } catch (err) {
    return next(err);
  }
}

/**
 * Listado de evoluciones médicas firmadas (GET /api/atenciones/:id/evoluciones).
 */
async function apiListarEvoluciones(req, res, next) {
  try {
    const atencionId = req.params.id;
    const ctx = db.ctxDe(req);

    const lista = await evolucionService.listarEvoluciones(atencionId, ctx);
    const data = lista.map((e) => ({
      id: e.id,
      fecha: e.fecha,
      medico: e.medico_nombre,
      medico_nombre: e.medico_nombre,
      medico_email: e.medico_email,
      subjetivo: e.subjetivo,
      objetivo: e.objetivo,
      analisis: e.analisis,
      plan: e.plan,
      descripcion: e.descripcion,
      fecha_formateada: e.fecha_formateada,
      hora: e.hora,
    }));

    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

/**
 * Guarda el borrador temporal de evolución SOAP (PUT /api/atenciones/:id/evoluciones/borrador).
 * Responde 409 si la atención está CERRADA, 403 si el médico no es el asignado o no tiene permiso.
 */
async function apiGuardarBorrador(req, res, next) {
  try {
    const atencion = req.atencion || res.locals.atencion;
    if (atencion && atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: { codigo: 'CERRADA', mensaje: 'La atención está cerrada' },
      });
    }

    const usuario = req.session && req.session.usuario;
    if (!usuario || (usuario.rol === 'MEDICO' && atencion && atencion.medico_id !== usuario.id)) {
      return res.status(403).json({
        ok: false,
        error: { codigo: 'ACCESO_DENEGADO', mensaje: 'Solo el médico titular puede registrar borradores de evolución' },
      });
    }

    const { subjetivo, objetivo, analisis, plan } = req.body || {};
    const contenido = {
      subjetivo: subjetivo || '',
      objetivo: objetivo || '',
      analisis: analisis || '',
      plan: plan || '',
    };

    await evolucionService.guardarBorrador(usuario.id, req.params.id, contenido, db.ctxDe(req));
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

/**
 * Firma definitiva de la evolución médica SOAP (POST /api/atenciones/:id/evoluciones).
 * Valida rol MEDICO, médico titular, atención abierta y campos S y A.
 */
async function apiFirmarEvolucion(req, res, next) {
  try {
    const atencion = req.atencion || res.locals.atencion;
    if (atencion && atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: { codigo: 'CERRADA', mensaje: 'La atención está cerrada' },
      });
    }

    const usuario = req.session && req.session.usuario;
    const esAdmin = Boolean(usuario && usuario.rol === 'ADMINISTRADOR');
    if (!usuario || (!esAdmin && usuario.rol !== 'MEDICO')) {
      return res.status(403).json({
        ok: false,
        error: { codigo: 'ROL_NO_PERMITIDO', mensaje: 'Acción reservada a MEDICO' },
      });
    }

    if (!esAdmin && atencion && atencion.medico_id !== usuario.id) {
      return res.status(403).json({
        ok: false,
        error: { codigo: 'ACCESO_DENEGADO', mensaje: 'Solo el médico titular puede firmar la evolución' },
      });
    }

    const { subjetivo, objetivo, analisis, plan } = req.body;
    const resultado = await evolucionService.firmarEvolucion(
      {
        atencionId: req.params.id,
        medicoId: usuario.id,
        subjetivo,
        objetivo,
        analisis,
        plan,
      },
      db.ctxDe(req)
    );

    return res.status(201).json({
      ok: true,
      data: {
        id: resultado.id,
        fecha: resultado.fecha,
      },
    });
  } catch (err) {
    if (
      err.status === 409 ||
      err.codigo === 'CERRADA' ||
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

    if (
      err.status === 403 ||
      err.codigo === 'ROL_NO_PERMITIDO' ||
      err.codigo === 'ACCESO_DENEGADO' ||
      (err.code === 'P0001' && (err.message.includes('MEDICO') || err.hint === 'RBAC'))
    ) {
      return res.status(403).json({
        ok: false,
        error: {
          codigo: err.codigo || 'ROL_NO_PERMITIDO',
          mensaje: err.message || 'Acción reservada a médicos',
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
  renderEvolucion,
  apiSignos,
  apiListarEvoluciones,
  apiGuardarBorrador,
  apiFirmarEvolucion,
};
