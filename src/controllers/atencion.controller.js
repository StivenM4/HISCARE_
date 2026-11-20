// src/controllers/atencion.controller.js — controlador para pestaña Consulta y signos vitales (C.4)
const db = require('../db');
const atencionService = require('../services/atencion.service');
const borradorService = require('../services/borrador.service');
const evolucionService = require('../services/evolucion.service');
const adendaService = require('../services/adenda.service');

/**
 * Renderiza la pestaña Consulta y signos vitales (C.4).
 */
async function renderConsulta(req, res, next) {
  try {
    const atencion = await atencionService.cargar(req.params.id, db.ctxDe(req));
    if (!atencion) {
      return res.status(404).render('errores/404', {
        titulo: 'Atención no encontrada',
        mensaje: 'La atención clínica solicitada no existe.',
        moduloActivo: 'atenciones',
      });
    }

    const soloLectura = res.locals.soloLectura !== undefined
      ? res.locals.soloLectura
      : (atencion.estado === 'CERRADA' || (req.session.usuario && req.session.usuario.rol === 'MEDICO' && atencion.medico_id !== req.session.usuario.id));

    return res.render('atencion/atencion_consulta', {
      titulo: 'Consulta y signos vitales',
      atencion,
      soloLectura,
      seccion: 'consulta',
      moduloActivo: 'atenciones',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Guarda el motivo de consulta definitivo (PUT /api/atenciones/:id).
 * Responde 409 si la atención está CERRADA, 403 si el médico no es el titular.
 */
async function guardarMotivo(req, res, next) {
  try {
    const atencion = req.atencion;
    if (atencion && atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: { codigo: 'CERRADA', mensaje: 'La atención está cerrada' },
      });
    }

    const usuario = req.session && req.session.usuario;
    if (usuario && usuario.rol === 'MEDICO' && atencion && atencion.medico_id !== usuario.id) {
      return res.status(403).json({
        ok: false,
        error: { codigo: 'ACCESO_DENEGADO', mensaje: 'Solo el médico titular puede registrar modificaciones' },
      });
    }

    await atencionService.guardarMotivo(req.params.id, req.body.motivo_consulta, db.ctxDe(req));
    return res.json({ ok: true });
  } catch (err) {
    if (err.status === 409 || err.codigo === 'CERRADA' || err.code === 'P0001') {
      return res.status(409).json({
        ok: false,
        error: { codigo: 'CERRADA', mensaje: err.message || 'La atención está cerrada' },
      });
    }
    if (err.status === 404) {
      return res.status(404).json({
        ok: false,
        error: { codigo: 'ATENCION_NO_ENCONTRADA', mensaje: 'Atención no encontrada' },
      });
    }
    next(err);
  }
}

/**
 * Guarda un borrador automático no confirmado (PUT /api/atenciones/:id/borrador).
 */
async function guardarBorrador(req, res, next) {
  try {
    const atencion = req.atencion;
    if (atencion && atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: { codigo: 'CERRADA', mensaje: 'La atención está cerrada' },
      });
    }

    const usuario = req.session && req.session.usuario;
    if (usuario && usuario.rol === 'MEDICO' && atencion && atencion.medico_id !== usuario.id) {
      return res.status(403).json({
        ok: false,
        error: { codigo: 'ACCESO_DENEGADO', mensaje: 'Solo el médico titular puede guardar borradores' },
      });
    }

    const usuarioId = req.session.usuario.id;
    const seccion = req.body.seccion || 'motivo';
    const contenido = req.body.contenido || {};

    await borradorService.guardar(usuarioId, req.params.id, seccion, contenido, db.ctxDe(req));
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * Registra una toma de signos vitales (POST /api/atenciones/:id/signos).
 */
async function registrarSignos(req, res, next) {
  try {
    const atencion = req.atencion;
    if (atencion && atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: { codigo: 'CERRADA', mensaje: 'La atención está cerrada; solo se permiten adendas' },
      });
    }

    const usuario = req.session && req.session.usuario;
    if (usuario && usuario.rol === 'MEDICO' && atencion && atencion.medico_id !== usuario.id) {
      return res.status(403).json({
        ok: false,
        error: { codigo: 'ACCESO_DENEGADO', mensaje: 'Solo el médico titular o enfermería pueden registrar signos' },
      });
    }

    const data = await atencionService.registrarSignos(req.params.id, req.body, db.ctxDe(req));
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    if (err.status === 422 || err.codigo === 'FUERA_DE_RANGO' || err.code === '23514' || err.codigo === 'DATOS_INCOMPLETOS' || err.codigo === 'VALIDACION_FALLIDA') {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: err.codigo || 'FUERA_DE_RANGO',
          mensaje: err.message,
          campo: err.campo || undefined,
          restriccion: err.constraint || err.restriccion || undefined,
        },
      });
    }
    if (err.status === 409 || err.codigo === 'CERRADA' || err.code === 'P0001') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CERRADA',
          mensaje: err.message || 'La atención está cerrada',
        },
      });
    }
    if (err.status === 404 || err.codigo === 'ATENCION_NO_ENCONTRADA') {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'ATENCION_NO_ENCONTRADA',
          mensaje: err.message || 'Atención no encontrada',
        },
      });
    }
    next(err);
  }
}

/**
 * Consulta de resumen de paciente por ID (GET /api/pacientes/:id/resumen).
 */
async function resumenPaciente(req, res, next) {
  try {
    const pacienteId = req.params.id;
    const data = await atencionService.resumenPaciente(pacienteId, db.ctxDe(req));
    if (!data) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: 'Paciente no encontrado',
        },
      });
    }
    return res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * Lista las atenciones clínicas (GET /atenciones).
 * - Filtra por médico si el usuario es MEDICO (a menos que ?todos=true).
 * - Lista todas si es ENFERMERO u otro rol permitido.
 * - Detecta atenciones abiertas para alertar o continuar atención en curso.
 */
async function listarAtenciones(req, res, next) {
  try {
    const usuario = req.session && req.session.usuario;
    let medicoId = null;

    if (usuario && usuario.rol === 'MEDICO') {
      if (req.query.todos !== 'true') {
        medicoId = usuario.id;
      }
    }

    const atenciones = await atencionService.listarAtenciones(
      { medicoId, limite: 50 },
      db.ctxDe(req)
    );

    const atencionAbierta = atenciones.find(
      (a) => a.estado === 'ABIERTA' && (usuario && usuario.rol === 'MEDICO' ? a.medico_id === usuario.id : true)
    ) || null;

    const esJson = Boolean(
      req.xhr ||
      (req.accepts('json') && !req.accepts('html')) ||
      req.query.formato === 'json'
    );

    if (esJson) {
      return res.json({
        ok: true,
        data: {
          atenciones,
          atencionAbierta,
          todos: req.query.todos === 'true',
        },
      });
    }

    return res.render('atencion/atenciones_lista', {
      titulo: 'Atención clínica',
      moduloActivo: 'atenciones',
      atenciones,
      atencionAbierta,
      usuario: req.session.usuario,
      todos: req.query.todos === 'true',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Consulta de signos vitales de la atención (GET /api/atenciones/:id/signos).
 * Si ?ultima=1 retorna la última toma, si no retorna todas las tomas.
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
    next(err);
  }
}

/**
 * Renderiza la pantalla de Cierre de atención inmutable (C.22).
 */
async function renderCierre(req, res, next) {
  try {
    const atencion = await atencionService.cargar(req.params.id, db.ctxDe(req));
    if (!atencion) {
      return res.status(404).render('errores/404', {
        titulo: 'Atención no encontrada',
        mensaje: 'La atención clínica solicitada no existe.',
        moduloActivo: 'atenciones',
      });
    }

    const checklist = await atencionService.validarCierre(req.params.id, db.ctxDe(req));
    const adendas = atencion.estado === 'CERRADA'
      ? await adendaService.listarAdendas(req.params.id, db.ctxDe(req))
      : [];

    const soloLectura = res.locals.soloLectura !== undefined
      ? res.locals.soloLectura
      : (atencion.estado === 'CERRADA' || (req.session.usuario && req.session.usuario.rol === 'MEDICO' && atencion.medico_id !== req.session.usuario.id));

    const esMedicoTitular = Boolean(req.session.usuario && (req.session.usuario.id === atencion.medico_id || req.session.usuario.rol === 'ADMINISTRADOR'));

    return res.render('atencion/cierre', {
      titulo: 'Cierre de atención',
      atencion,
      checklist,
      adendas,
      soloLectura,
      esMedicoTitular,
      seccion: 'cierre',
      figuraTrace: 'C22',
      moduloActivo: 'atenciones',
      usuario: req.session.usuario,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * API para consultar el estado del checklist de cierre (GET /api/atenciones/:id/validar-cierre).
 */
async function apiValidarCierre(req, res, next) {
  try {
    const checklist = await atencionService.validarCierre(req.params.id, db.ctxDe(req));
    return res.json({
      ok: true,
      data: checklist.reglas,
      puedeCerrar: checklist.puedeCerrar,
    });
  } catch (err) {
    if (err.status === 404 || err.codigo === 'ATENCION_NO_ENCONTRADA') {
      return res.status(404).json({
        ok: false,
        error: { codigo: 'ATENCION_NO_ENCONTRADA', mensaje: 'Atención no encontrada' },
      });
    }
    next(err);
  }
}

/**
 * API para efectuar el cierre definitivo con sello SHA-256 (POST /api/atenciones/:id/cerrar).
 */
async function apiCerrarAtencion(req, res, next) {
  try {
    const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
    const resultado = await atencionService.cerrar(req.params.id, usuarioId, db.ctxDe(req));
    return res.json({
      ok: true,
      data: {
        id: resultado.id,
        estado: resultado.estado,
        fecha_cierre: resultado.fecha_cierre,
        fecha_cierre_formateada: resultado.fecha_cierre_formateada,
        firma_hash: resultado.firma_hash,
      },
    });
  } catch (err) {
    if (err.status === 403 || err.codigo === 'NO_ES_TITULAR') {
      return res.status(403).json({
        ok: false,
        error: { codigo: 'NO_ES_TITULAR', mensaje: err.message || 'Solo el médico titular puede cerrar la atención' },
      });
    }
    if (err.status === 409 || err.codigo === 'CERRADA' || err.codigo === 'CHECKLIST_INCOMPLETO' || err.codigo === 'REGLA_DE_NEGOCIO' || err.code === 'P0001') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: err.codigo || 'CONFLICTO',
          mensaje: err.message,
          reglas: err.reglas || undefined,
        },
      });
    }
    if (err.status === 404 || err.codigo === 'ATENCION_NO_ENCONTRADA') {
      return res.status(404).json({
        ok: false,
        error: { codigo: 'ATENCION_NO_ENCONTRADA', mensaje: err.message || 'Atención no encontrada' },
      });
    }
    next(err);
  }
}

/**
 * API para verificar la validez del sello criptográfico SHA-256 (GET /api/atenciones/:id/verificar-firma).
 */
async function apiVerificarFirma(req, res, next) {
  try {
    const resultado = await atencionService.verificarFirma(req.params.id, db.ctxDe(req));
    return res.json({
      ok: true,
      data: { valida: Boolean(resultado && resultado.valida) },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * API para listar adendas de la atención (GET /api/atenciones/:id/adendas).
 */
async function apiListarAdendas(req, res, next) {
  try {
    const adendas = await adendaService.listarAdendas(req.params.id, db.ctxDe(req));
    return res.json({
      ok: true,
      data: adendas,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * API para crear una adenda clínica inmutable (POST /api/atenciones/:id/adendas).
 */
async function apiCrearAdenda(req, res, next) {
  try {
    const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
    const adenda = await adendaService.crearAdenda(
      {
        atencionId: req.params.id,
        autorId: usuarioId,
        texto: req.body.texto,
      },
      db.ctxDe(req)
    );

    return res.status(201).json({
      ok: true,
      data: adenda,
    });
  } catch (err) {
    if (err.status === 409 || err.codigo === 'ATENCION_NO_CERRADA' || err.codigo === 'REGLA_DE_NEGOCIO' || err.code === 'P0001') {
      return res.status(409).json({
        ok: false,
        error: { codigo: err.codigo || 'CONFLICTO', mensaje: err.message || 'Las adendas solo aplican a atenciones cerradas' },
      });
    }
    if (err.status === 404 || err.codigo === 'ATENCION_NO_ENCONTRADA') {
      return res.status(404).json({
        ok: false,
        error: { codigo: 'ATENCION_NO_ENCONTRADA', mensaje: err.message || 'Atención no encontrada' },
      });
    }
    next(err);
  }
}

module.exports = {
  listarAtenciones,
  renderConsulta,
  guardarMotivo,
  guardarBorrador,
  registrarSignos,
  resumenPaciente,
  apiSignos,
  renderCierre,
  apiValidarCierre,
  apiCerrarAtencion,
  apiVerificarFirma,
  apiListarAdendas,
  apiCrearAdenda,
};


