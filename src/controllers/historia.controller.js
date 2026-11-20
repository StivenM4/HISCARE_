// src/controllers/historia.controller.js — controlador para Pantalla C.9 (Historia clínica longitudinal)
const db = require('../db');
const { traducir, NoEncontrado, ErrorValidacion } = require('../db/errores');
const historiaService = require('../services/historia.service');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODOS_VALIDOS = ['1a', '5a', 'todo'];

/**
 * Renderiza la vista de historia clínica longitudinal (Pantalla C.9).
 * GET /historias/:pacienteId
 * Query params: evento? (id del hito para auto-apertura), periodo? ('1a', '5a', 'todo')
 */
async function renderTimeline(req, res, next) {
  try {
    const { pacienteId } = req.params;

    if (!pacienteId || !UUID_REGEX.test(pacienteId)) {
      return res.status(404).render('errores/404', {
        titulo: 'Historia clínica no encontrada',
        mensaje: 'El identificador del paciente no es válido o no fue encontrado.',
        moduloActivo: 'pacientes',
      });
    }

    // Busca paciente, historia clínica y audita el acceso confidencial (SELECT_CONFIDENTIAL)
    const datos = await historiaService.obtenerHistoriaPorPaciente(pacienteId, db.ctxDe(req));

    if (!datos || !datos.historia) {
      return res.status(404).render('errores/404', {
        titulo: 'Historia clínica no encontrada',
        mensaje: 'No se encontró la historia clínica para el paciente solicitado.',
        moduloActivo: 'pacientes',
      });
    }

    const { paciente, historia } = datos;

    // Objeto mock/wrapper para el banner institucional (_banner_paciente.ejs)
    const atencionBanner = {
      id: historia.id,
      codigo_atencion: 'HC-' + (historia.id ? historia.id.slice(0, 8).toUpperCase() : '0000'),
      codigo: 'HC-' + (historia.id ? historia.id.slice(0, 8).toUpperCase() : '0000'),
      estado: historia.activo ? 'ACTIVA' : 'INACTIVA',
      paciente: paciente.paciente || `${paciente.nombres || ''} ${paciente.apellidos || ''}`.trim() || 'Paciente',
      nombres: paciente.nombres,
      apellidos: paciente.apellidos,
      tipo_documento: paciente.tipo_documento,
      numero_documento: paciente.numero_documento,
      documento: paciente.documento,
      edad: paciente.edad,
      sexo: paciente.sexo,
      eps: paciente.eps,
      regimen: paciente.regimen,
      tipo_plan: paciente.tipo_plan,
      alergias: paciente.alergias || [],
    };

    const eventoId = (req.query.evento || '').trim();
    const periodo = (req.query.periodo || 'todo').trim().toLowerCase();

    res.render('historias/timeline_clinico', {
      titulo: 'Historia clínica longitudinal',
      moduloActivo: 'pacientes',
      paciente,
      historia,
      atencion: atencionBanner,
      eventoId,
      periodo: PERIODOS_VALIDOS.includes(periodo) ? periodo : 'todo',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * API REST que retorna los hitos cronológicos unificados de una historia clínica.
 * GET /api/historias/:id/timeline
 * Query params: periodo=1a|5a|todo
 */
async function apiTimeline(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'NO_ENCONTRADO',
          mensaje: 'Historia clínica no encontrada',
        },
      });
    }

    const periodoRaw = (req.query.periodo || 'todo').toString().trim().toLowerCase();
    if (!PERIODOS_VALIDOS.includes(periodoRaw)) {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'VALIDACION_FALLIDA',
          mensaje: "El periodo debe ser '1a', '5a' o 'todo'",
          campos: ['periodo'],
        },
      });
    }

    const hitos = await historiaService.obtenerTimeline(id, periodoRaw, db.ctxDe(req));

    return res.json({
      ok: true,
      data: hitos,
    });
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
    if (t) return res.status(t.status).json({ ok: false, error: t.error });
    next(err);
  }
}

/**
 * API REST que retorna el resumen completo de una atención clínica para el panel de detalle.
 * GET /api/atenciones/:id/resumen
 */
async function apiResumen(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'NO_ENCONTRADO',
          mensaje: 'Atención clínica no encontrada',
        },
      });
    }

    const resumen = await historiaService.obtenerResumenAtencion(id, db.ctxDe(req));

    if (!resumen) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'NO_ENCONTRADO',
          mensaje: 'Atención clínica no encontrada',
        },
      });
    }

    return res.json({
      ok: true,
      data: resumen,
    });
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
    if (t) return res.status(t.status).json({ ok: false, error: t.error });
    next(err);
  }
}

module.exports = {
  renderTimeline,
  verHistoria: renderTimeline,
  apiTimeline,
  apiResumen,
  apiResumenAtencion: apiResumen,
};
