// src/controllers/cita.controller.js — controlador para agendamiento de citas y franjas horarias (C.16)
const db = require('../db');
const { traducir } = require('../db/errores');
const citaService = require('../services/cita.service');
const agendaService = require('../services/agenda.service');
const atencionService = require('../services/atencion.service');

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD

/**
 * Valida si una cadena tiene el formato estricto ISO YYYY-MM-DD y corresponde a una fecha real.
 */
function esFechaValida(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

/**
 * Formatea una fecha YYYY-MM-DD a representación visual corta (ej. 'Lun 21/09/2026').
 */
function formatearFechaVisual(fechaISO) {
  const diasSem = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const [y, m, d] = fechaISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const diaStr = diasSem[dt.getUTCDay()] || 'Lun';
  return `${diaStr} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/**
 * Consulta la lista de médicos activos ordenados alfabéticamente.
 */
async function obtenerMedicosActivos() {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
      WHERE r.nombre = 'MEDICO' AND u.activo
      ORDER BY u.nombre`
  );
  return rows;
}

/**
 * Carga filas, indicadores y sala de espera de la agenda diaria para un médico y fecha.
 */
async function cargarDatosAgendaDiaria(medicoId, fecha) {
  const [filas, indicadores, salaEspera] = await Promise.all([
    medicoId ? citaService.agendaDiaria(medicoId, fecha) : Promise.resolve([]),
    medicoId ? citaService.obtenerIndicadoresAgenda(medicoId, fecha) : Promise.resolve({
      total: 0,
      citas_del_dia: 0,
      en_sala: 0,
      atendidas: 0,
      canceladas_no_asistio: 0,
    }),
    medicoId ? citaService.obtenerSalaEspera(medicoId, fecha) : Promise.resolve([]),
  ]);
  return { filas, indicadores, salaEspera };
}

/**
 * Renderiza la pantalla C.16 de agendamiento de cita nueva.
 * GET /citas/nueva?paciente=:id
 */
async function renderNuevaCita(req, res, next) {
  try {
    const pacienteId = req.query.paciente;
    if (!pacienteId) {
      return res.status(404).render('errores/404', {
        titulo: 'Paciente no encontrado',
        mensaje: 'Debe especificar un paciente para agendar la cita.',
      });
    }

    const datosPaciente = await citaService.obtenerPacienteConAfiliacion(pacienteId);
    if (!datosPaciente) {
      return res.status(404).render('errores/404', {
        titulo: 'Paciente no encontrado',
        mensaje: 'El paciente solicitado no existe en el sistema.',
      });
    }

    const { paciente, afiliacion } = datosPaciente;
    const { rows: especialidades } = await db.query(
      'SELECT id, nombre FROM especialidades ORDER BY nombre'
    );

    return res.render('citas/cita_nueva', {
      paciente,
      afiliacion,
      especialidades,
      fecha: hoy(),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Consulta los profesionales médicos activos asignados a una especialidad médica.
 * GET /api/especialidades/:id/profesionales
 */
async function getProfesionalesPorEspecialidad(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT u.id, u.nombre, r.nombre AS rol, ue.fecha_creacion AS asignado_desde
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       JOIN usuario_especialidad ue ON ue.usuario_id = u.id
       WHERE ue.especialidad_id = $1 AND r.nombre IN ('MEDICO', 'ADMINISTRADOR') AND u.activo = true
       ORDER BY u.nombre`,
      [id]
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    return next(err);
  }
}

/**
 * Retorna las franjas horarias configuradas y su disponibilidad para un médico y fecha.
 * GET /api/agenda/:medicoId/franjas?fecha=YYYY-MM-DD
 */
async function getFranjas(req, res, next) {
  try {
    const { medicoId } = req.params;
    const { fecha } = req.query;

    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(422).json({
        ok: false,
        error: { codigo: 'FECHA_INVALIDA', mensaje: 'Use AAAA-MM-DD' },
      });
    }

    const franjas = await agendaService.franjasLibres(medicoId, fecha);
    return res.json({ ok: true, data: franjas });
  } catch (err) {
    return next(err);
  }
}

/**
 * Registra una nueva cita médica controlando cruces de horario.
 * POST /api/citas
 */
async function crearCita(req, res, next) {
  try {
    const data = await citaService.agendar(req.body, db.ctxDe(req));
    return res.status(201).json({
      ok: true,
      data: { cita_id: data.cita_id },
    });
  } catch (err) {
    // 23P01: Violación del constraint de exclusión no_cruce_citas
    if (err.code === '23P01') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CRUCE_HORARIO',
          mensaje: 'La franja fue tomada por otro usuario',
          alternativas: err.alternativas || [],
        },
      });
    }

    // P0001: Violación de trigger de base de datos (ej. trg_citas_medico)
    if (err.code === 'P0001') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'REGLA_DE_NEGOCIO',
          mensaje: err.message || 'El profesional asignado no es un usuario activo con rol MEDICO',
        },
      });
    }

    // Traducción de otros códigos SQL conocidos (23505, 23514, 23503, etc.)
    const traducido = traducir(err);
    if (traducido) {
      return res.status(traducido.status).json({
        ok: false,
        error: traducido.error,
      });
    }

    return next(err);
  }
}

/**
 * Renderiza la pantalla C.17 de gestión (reprogramación y cancelación) de una cita médica.
 * GET /citas/:id
 */
async function renderGestionCita(req, res, next) {
  try {
    const { id } = req.params;
    const cita = await citaService.obtenerCitaGestion(id);

    if (!cita) {
      return res.status(404).render('errores/404', {
        titulo: 'Cita no encontrada',
        mensaje: 'La cita solicitada no existe en el sistema.',
      });
    }

    const { rows: medicos } = await db.query(
      `SELECT u.id, u.nombre
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
        WHERE r.nombre IN ('MEDICO', 'ADMINISTRADOR') AND u.activo
        ORDER BY u.nombre`
    );

    const historial = await citaService.obtenerHistorialCita(id);

    return res.render('citas/cita_gestion', {
      cita,
      medicos,
      historial,
      usuario: req.session.usuario,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Consulta los datos en formato JSON de una cita para la gestión.
 * GET /api/citas/:id
 */
async function getCitaDetalle(req, res, next) {
  try {
    const { id } = req.params;
    const cita = await citaService.obtenerCitaGestion(id);

    if (!cita) {
      return res.status(404).json({
        ok: false,
        error: { codigo: 'CITA_NO_ENCONTRADA', mensaje: 'La cita solicitada no existe' },
      });
    }

    return res.json({
      ok: true,
      data: {
        id: cita.id,
        paciente: cita.paciente,
        paciente_id: cita.paciente_id,
        paciente_documento: cita.paciente_documento,
        medico: cita.medico_nombre,
        medico_id: cita.medico_id,
        fecha: cita.fecha,
        fecha_formateada: cita.fecha_formateada,
        duracion_minutos: cita.duracion_minutos,
        hora_fin: cita.hora_fin,
        estado: cita.estado,
        cita_origen_id: cita.cita_origen_id,
        motivo_cambio: cita.motivo_cambio,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Consulta el historial de cambios y auditoría de una cita.
 * GET /api/citas/:id/historial
 */
async function getHistorialCita(req, res, next) {
  try {
    const { id } = req.params;
    const historial = await citaService.obtenerHistorialCita(id);

    return res.json({
      ok: true,
      data: historial,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Procesa la solicitud transaccional de reprogramación de una cita.
 * POST /api/citas/:id/reprogramar
 */
async function reprogramarCita(req, res, next) {
  try {
    const data = await citaService.reprogramarCita(req.params.id, req.body, db.ctxDe(req));
    return res.status(201).json({
      ok: true,
      data,
    });
  } catch (err) {
    if (err.code === '23P01' || err.status === 409) {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: err.code === '23P01' ? 'CRUCE_HORARIO' : (err.codigo || 'ESTADO_INVALIDO'),
          mensaje: err.message,
          alternativas: err.alternativas || [],
        },
      });
    }

    const traducido = traducir(err);
    if (traducido) {
      return res.status(traducido.status).json({
        ok: false,
        error: traducido.error,
      });
    }

    return next(err);
  }
}

/**
 * Procesa la cancelación transaccional de una cita.
 * POST /api/citas/:id/cancelar
 */
async function cancelarCita(req, res, next) {
  try {
    await citaService.cancelarCita(req.params.id, req.body, db.ctxDe(req));
    return res.status(200).json({
      ok: true,
      data: { cancelada: true },
    });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: err.codigo || 'ESTADO_INVALIDO',
          mensaje: err.message,
        },
      });
    }

    const traducido = traducir(err);
    if (traducido) {
      return res.status(traducido.status).json({
        ok: false,
        error: traducido.error,
      });
    }

    return next(err);
  }
}

/**
 * Renderiza la pantalla C.18: Agenda médica diaria, sala de espera e indicadores de la jornada.
 * GET /agenda?medico=&fecha=
 */
async function agendaDiaria(req, res, next) {
  try {
    const { usuario } = req.session;
    const medicos = await obtenerMedicosActivos();

    const medicoId = usuario.rol === 'MEDICO'
      ? usuario.id
      : (req.query.medico || (medicos[0] && medicos[0].id) || null);

    const fecha = req.query.fecha && esFechaValida(req.query.fecha) ? req.query.fecha : hoy();

    const { filas, indicadores, salaEspera } = await cargarDatosAgendaDiaria(medicoId, fecha);

    return res.render('citas/agenda_diaria', {
      medicos,
      medicoId,
      fecha,
      filas,
      indicadores,
      salaEspera,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Retorna en JSON la agenda médica diaria, indicadores y sala de espera.
 * GET /api/agenda/diaria?medico=&fecha=
 */
async function apiAgendaDiaria(req, res, next) {
  try {
    const fechaQuery = req.query.fecha;
    if (fechaQuery !== undefined && fechaQuery !== '' && !esFechaValida(fechaQuery)) {
      return res.status(422).json({
        ok: false,
        error: { codigo: 'FECHA_INVALIDA', mensaje: 'Formato de fecha inválido. Use AAAA-MM-DD' },
      });
    }

    const { usuario } = req.session;
    let medicoId = usuario.rol === 'MEDICO' ? usuario.id : (req.query.medico || null);
    if (!medicoId && usuario.rol !== 'MEDICO') {
      const medicos = await obtenerMedicosActivos();
      medicoId = (medicos[0] && medicos[0].id) || null;
    }

    const fecha = fechaQuery || hoy();
    const fechaVisual = formatearFechaVisual(fecha);
    const { filas, indicadores, salaEspera } = await cargarDatosAgendaDiaria(medicoId, fecha);

    return res.json({
      ok: true,
      data: {
        medicoId,
        fecha,
        fechaVisual,
        filas,
        indicadores,
        salaEspera,
      },
    });
  } catch (err) {
    const traducido = traducir(err);
    if (traducido) {
      return res.status(traducido.status).json({
        ok: false,
        error: traducido.error,
      });
    }
    return next(err);
  }
}

/**
 * Modifica el estado de una cita médica validando las transiciones de estado permitidas.
 * PATCH /api/citas/:id/estado
 */
async function cambiarEstado(req, res, next) {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const estadosPermitidos = ['CONFIRMADA', 'EN_SALA', 'NO_ASISTIO', 'CANCELADA'];

    if (!estado || !estadosPermitidos.includes(estado)) {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'VALIDACION_FALLIDA',
          mensaje: 'Estado no permitido. Debe ser CONFIRMADA, EN_SALA, NO_ASISTIO o CANCELADA',
        },
      });
    }

    await citaService.cambiarEstado(id, estado, db.ctxDe(req));
    return res.status(200).json({ ok: true, data: { id, estado } });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'TRANSICION_INVALIDA',
          mensaje: err.message,
        },
      });
    }

    const traducido = traducir(err);
    if (traducido) {
      return res.status(traducido.status).json({
        ok: false,
        error: traducido.error,
      });
    }

    return next(err);
  }
}

/**
 * Inicia la atención clínica formal a partir de una cita en sala de espera (C.18 -> C.4).
 * POST /api/citas/:id/atencion
 */
async function iniciarAtencion(req, res, next) {
  try {
    const { id } = req.params;
    const data = await atencionService.iniciarDesdeCita(id, db.ctxDe(req));
    return res.status(201).json({
      ok: true,
      data: { atencion_id: data.atencion_id },
    });
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({
        ok: false,
        error: {
          codigo: 'NO_AUTORIZADO',
          mensaje: err.message,
        },
      });
    }

    if (err.status === 409) {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: err.codigo || 'CONFLICTO',
          mensaje: err.message,
        },
      });
    }

    if (err.status === 404) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'CITA_NO_ENCONTRADA',
          mensaje: err.message,
        },
      });
    }

    const traducido = traducir(err);
    if (traducido) {
      return res.status(traducido.status).json({
        ok: false,
        error: traducido.error,
      });
    }

    return next(err);
  }
}

/**
 * Retorna las citas en sala de espera con tiempo transcurrido para un profesional médico.
 * GET /api/agenda/:medicoId/sala
 */
async function getSalaEspera(req, res, next) {
  try {
    const { medicoId } = req.params;
    const fecha = req.query.fecha || hoy();
    const sala = await citaService.obtenerSalaEspera(medicoId, fecha);
    return res.status(200).json({
      ok: true,
      data: sala,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  renderNuevaCita,
  getProfesionalesPorEspecialidad,
  getFranjas,
  crearCita,
  renderGestionCita,
  getCitaDetalle,
  getHistorialCita,
  reprogramarCita,
  cancelarCita,
  agendaDiaria,
  apiAgendaDiaria,
  cambiarEstado,
  iniciarAtencion,
  getSalaEspera,
};
