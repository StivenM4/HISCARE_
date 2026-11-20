// src/services/agenda.service.js — servicio de horario semanal y agendas médicas (C.13, C.16, EDT-CIT-01)
const db = require('../db');
const { ErrorValidacion, NoEncontrado } = require('../db/errores');

/**
 * Consulta el horario semanal configurado para un médico.
 * @param {string} medicoId
 * @returns {Promise<Array<{id: string, dia_semana: number, hora_inicio: string, hora_fin: string, duracion_cita: number, activo: boolean}>>}
 */
async function obtenerHorarioMedico(medicoId) {
  const { rows } = await db.query(
    `SELECT id, dia_semana,
            to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
            to_char(hora_fin, 'HH24:MI') AS hora_fin,
            duracion_cita, activo
     FROM agendas_medicas
     WHERE medico_id = $1
     ORDER BY dia_semana ASC, hora_inicio ASC`,
    [medicoId]
  );
  return rows;
}

/**
 * Valida y persiste el horario semanal de un médico en una transacción atómica con auditoría.
 * @param {object} ctx Contexto de auditoría (usuarioId, ip)
 * @param {string} medicoId Identificador UUID del médico
 * @param {Array<{dia_semana: number, hora_inicio: string, hora_fin: string, duracion_cita?: number, activo?: boolean}>} filas
 * @returns {Promise<{ok: boolean, medicoId: string, guardados: number}>}
 */
async function guardarHorarioMedico(ctx, medicoId, filas = []) {
  // 1. Validar que el usuario exista y tenga rol MEDICO
  const { rows: usuarios } = await db.query(
    `SELECT u.id, u.nombre, r.nombre AS rol
     FROM usuarios u
     JOIN roles r ON u.rol_id = r.id
     WHERE u.id = $1`,
    [medicoId]
  );

  if (usuarios.length === 0) {
    throw new NoEncontrado('El profesional médico especificado no existe');
  }

  if (usuarios[0].rol !== 'MEDICO' && usuarios[0].rol !== 'ADMINISTRADOR') {
    throw new ErrorValidacion('El usuario debe tener rol MEDICO o ADMINISTRADOR para configurar su horario');
  }

  const listaFilas = Array.isArray(filas) ? filas : [];

  // 2. Validar cada franja horaria antes de iniciar la transacción
  const franjasValidadas = [];
  for (let i = 0; i < listaFilas.length; i++) {
    const f = listaFilas[i];
    const indice = i + 1;

    const dia = parseInt(f.dia_semana, 10);
    if (isNaN(dia) || dia < 1 || dia > 7) {
      throw new ErrorValidacion(
        `Fila ${indice}: El día de la semana debe ser un valor entre 1 (lunes) y 7 (domingo)`,
        [{ campo: `filas[${i}].dia_semana`, mensaje: 'Día de la semana inválido' }]
      );
    }

    const horaInicio = typeof f.hora_inicio === 'string' ? f.hora_inicio.trim() : '';
    const horaFin = typeof f.hora_fin === 'string' ? f.hora_fin.trim() : '';

    if (!horaInicio || !horaFin) {
      throw new ErrorValidacion(
        `Fila ${indice}: Las horas de inicio y fin son obligatorias`,
        [{ campo: `filas[${i}].horas`, mensaje: 'Horas incompletas' }]
      );
    }

    if (horaFin <= horaInicio) {
      throw new ErrorValidacion(
        'La hora de fin debe ser posterior a la hora de inicio',
        [{ campo: `filas[${i}].hora_fin`, mensaje: 'La hora de fin debe ser posterior a la de inicio' }]
      );
    }

    const duracion = f.duracion_cita !== undefined && f.duracion_cita !== null
      ? parseInt(f.duracion_cita, 10)
      : 30;

    if (isNaN(duracion) || duracion < 10 || duracion > 120) {
      throw new ErrorValidacion(
        `Fila ${indice}: La duración de la cita debe estar entre 10 y 120 minutos`,
        [{ campo: `filas[${i}].duracion_cita`, mensaje: 'Duración fuera de rango (10-120 min)' }]
      );
    }

    franjasValidadas.push({
      dia_semana: dia,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      duracion_cita: duracion,
      activo: f.activo !== false,
    });
  }

  // 3. Persistencia transaccional: reemplazo completo de horarios del médico
  await db.tx(ctx, async (client) => {
    await client.query('DELETE FROM agendas_medicas WHERE medico_id = $1', [medicoId]);

    for (const f of franjasValidadas) {
      await client.query(
        `INSERT INTO agendas_medicas (medico_id, dia_semana, hora_inicio, hora_fin, duracion_cita, activo)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [medicoId, f.dia_semana, f.hora_inicio, f.hora_fin, f.duracion_cita, f.activo]
      );
    }
  });

  return { ok: true, medicoId, guardados: franjasValidadas.length };
}

/**
 * Consulta las franjas horarias configuradas para un profesional médico en una fecha específica,
 * calculando si cada franja está LIBRE, OCUPADA o PASADA.
 *
 * @param {string} medicoId UUID del profesional médico
 * @param {string} fecha Fecha en formato YYYY-MM-DD
 * @returns {Promise<Array<{inicio: string, fin: string, duracion_cita: number, estado: 'LIBRE'|'OCUPADA'|'PASADA'}>>}
 */
async function franjasLibres(medicoId, fecha) {
  const { rows } = await db.query(
    `SELECT to_char(g, 'YYYY-MM-DD"T"HH24:MI') AS inicio,
            to_char(g + make_interval(mins => am.duracion_cita), 'HH24:MI') AS fin,
            am.duracion_cita,
            CASE WHEN g < now()::timestamp THEN 'PASADA'
                 WHEN EXISTS (SELECT 1 FROM citas c
                              WHERE c.medico_id = am.medico_id
                                AND c.estado NOT IN ('CANCELADA','REPROGRAMADA')
                                AND tsrange(c.fecha, c.hora_fin) && tsrange(g, g + make_interval(mins => am.duracion_cita)))
                 THEN 'OCUPADA' ELSE 'LIBRE' END AS estado
       FROM agendas_medicas am,
            generate_series($2::date + am.hora_inicio,
                            $2::date + am.hora_fin - make_interval(mins => am.duracion_cita),
                            make_interval(mins => am.duracion_cita)) AS g
      WHERE am.medico_id = $1 AND am.activo AND am.dia_semana = extract(isodow FROM $2::date)
      ORDER BY g`,
    [medicoId, fecha]
  );
  return rows;
}

module.exports = {
  obtenerHorarioMedico,
  guardarHorarioMedico,
  franjasLibres,
};
