// src/services/cita.service.js — agendamiento (C.16) y agenda diaria (C.18)
const db = require('../db');
const agendaService = require('./agenda.service');

// Franjas del horario del médico para una fecha, marcando las ocupadas y las pasadas
async function franjasLibres(medicoId, fecha) {
  return agendaService.franjasLibres(medicoId, fecha);
}

// Crea la cita en estado PROGRAMADA; la BD calcula hora_fin y evita cruces (no_cruce_citas)
async function agendar(dto, ctx) {
  try {
    return await db.tx(ctx, async (c) => {
      const duracion = dto.duracion_minutos ? parseInt(dto.duracion_minutos, 10) : 30;
      const { rows } = await c.query(
        `INSERT INTO citas (paciente_id, medico_id, fecha, duracion_minutos)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [dto.paciente_id, dto.medico_id, dto.fecha, duracion]
      );
      return { cita_id: rows[0].id };
    });
  } catch (err) {
    if (err.code === '23P01') {                       // HIS-E-04: otro usuario ganó la franja
      const fechaSolo = typeof dto.fecha === 'string' ? dto.fecha.slice(0, 10) : '';
      const libres = (await franjasLibres(dto.medico_id, fechaSolo))
        .filter((f) => f.estado === 'LIBRE');
      const pedida = Date.parse(dto.fecha);
      libres.sort((a, b) => Math.abs(Date.parse(a.inicio) - pedida) - Math.abs(Date.parse(b.inicio) - pedida));
      err.alternativas = libres.slice(0, 3);
    }
    throw err;
  }
}

/**
 * Consulta la información del paciente y su estado de afiliación a aseguradora para C.16.
 * @param {string} pacienteId UUID del paciente
 * @returns {Promise<{paciente: object, afiliacion: object}|null>}
 */
async function obtenerPacienteConAfiliacion(pacienteId) {
  const { rows: [paciente] } = await db.query(
    `SELECT id,
            nombres || ' ' || apellidos AS nombre,
            tipo_documento || ' ' || numero_documento AS documento
       FROM pacientes
      WHERE id = $1`,
    [pacienteId]
  );

  if (!paciente) {
    return null;
  }

  const { rows: [afiliacionRow] } = await db.query(
    `SELECT s.nombre AS aseguradora_nombre,
            s.nombre AS eps,
            pa.tipo_usuario,
            to_char(pa.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
            coalesce(pa.activo, false) AS activa,
            (coalesce(pa.activo, false) = true
             AND (pa.fecha_fin IS NULL OR pa.fecha_fin >= CURRENT_DATE)
             AND (pa.fecha_inicio IS NULL OR pa.fecha_inicio <= CURRENT_DATE)
            ) AS vigente
       FROM paciente_aseguradora pa
       JOIN aseguradoras s ON s.id = pa.aseguradora_id
      WHERE pa.paciente_id = $1
      ORDER BY pa.activo DESC, pa.fecha_inicio DESC NULLS LAST, pa.fecha_creacion DESC
      LIMIT 1`,
    [pacienteId]
  );

  const afiliacion = afiliacionRow || {
    aseguradora_nombre: 'Sin aseguradora',
    eps: 'Sin aseguradora',
    tipo_usuario: 'Particular',
    fecha_fin: null,
    activa: false,
    vigente: false,
  };

  return { paciente, afiliacion };
}

/**
 * Consulta plana de paciente y aseguradora/afiliación.
 * @param {string} pacienteId UUID del paciente
 * @returns {Promise<object|null>}
 */
async function obtenerPacienteAfiliacion(pacienteId) {
  const { rows: [fila] } = await db.query(
    `SELECT p.id,
            p.nombres || ' ' || p.apellidos AS nombre,
            p.tipo_documento || ' ' || p.numero_documento AS documento,
            coalesce(s.nombre, 'Sin aseguradora') AS aseguradora_nombre,
            coalesce(s.nombre, 'Sin aseguradora') AS eps,
            coalesce(pa.tipo_usuario, 'Particular') AS tipo_usuario,
            to_char(pa.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
            coalesce(pa.activo, false) AS activa,
            (coalesce(pa.activo, false) = true
             AND (pa.fecha_fin IS NULL OR pa.fecha_fin >= CURRENT_DATE)
             AND (pa.fecha_inicio IS NULL OR pa.fecha_inicio <= CURRENT_DATE)
            ) AS vigente
       FROM pacientes p
       LEFT JOIN paciente_aseguradora pa ON pa.paciente_id = p.id
       LEFT JOIN aseguradoras s ON s.id = pa.aseguradora_id
      WHERE p.id = $1
      ORDER BY pa.activo DESC NULLS LAST, pa.fecha_inicio DESC NULLS LAST
      LIMIT 1`,
    [pacienteId]
  );
  return fila || null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function agendaDiaria(medicoId, fecha) {
  if (!medicoId) return [];

  const { rows } = await db.query(
    `SELECT c.id,
            to_char(c.fecha, 'HH24:MI') AS hora,
            p.id AS paciente_id,
            p.nombres || ' ' || p.apellidos AS paciente,
            c.estado,
            c.duracion_minutos,
            a.id AS atencion_id
       FROM citas c
       JOIN pacientes p ON p.id = c.paciente_id
       LEFT JOIN atenciones a ON a.cita_id = c.id
      WHERE c.medico_id = $1
        AND c.fecha::date = $2
        AND c.estado <> 'REPROGRAMADA'
      ORDER BY c.fecha ASC`,
    [medicoId, fecha]
  );
  return rows;
}

/**
 * Calcula los indicadores agregados de citas de la jornada para un profesional médico.
 * - Citas del día: total citas (excluyendo 'REPROGRAMADA')
 * - En sala de espera: estado = 'EN_SALA'
 * - Atendidas: estado = 'ATENDIDA'
 * - Canceladas / no asistió: estado IN ('CANCELADA', 'NO_ASISTIO')
 */
async function obtenerIndicadoresAgenda(medicoId, fecha) {
  if (!medicoId) {
    return {
      total: 0,
      citas_del_dia: 0,
      en_sala: 0,
      atendidas: 0,
      canceladas_no_asistio: 0,
    };
  }

  const { rows } = await db.query(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE estado = 'EN_SALA')::int AS en_sala,
       count(*) FILTER (WHERE estado = 'ATENDIDA')::int AS atendidas,
       count(*) FILTER (WHERE estado IN ('CANCELADA', 'NO_ASISTIO'))::int AS canceladas_no_asistio
     FROM citas
    WHERE medico_id = $1
      AND fecha::date = $2
      AND estado <> 'REPROGRAMADA'`,
    [medicoId, fecha]
  );

  const row = rows[0] || {};
  const total = parseInt(row.total, 10) || 0;
  const enSala = parseInt(row.en_sala, 10) || 0;
  const atendidas = parseInt(row.atendidas, 10) || 0;
  const canceladasNoAsistio = parseInt(row.canceladas_no_asistio, 10) || 0;

  return {
    total,
    citas_del_dia: total,
    en_sala: enSala,
    atendidas,
    canceladas_no_asistio: canceladasNoAsistio,
  };
}

/**
 * Consulta las citas en estado 'EN_SALA' para el médico y fecha,
 * ordenadas por hora_llegada ASC, calculando los minutos de espera transcurridos.
 */
async function obtenerSalaEspera(medicoId, fecha) {
  if (!medicoId) return [];

  const { rows } = await db.query(
    `SELECT c.id AS cita_id,
            p.nombres || ' ' || p.apellidos AS paciente,
            to_char(c.hora_llegada, 'HH24:MI') AS hora_llegada,
            coalesce(round(extract(epoch from (now() - c.hora_llegada)) / 60)::int, 0) AS minutos_espera
       FROM citas c
       JOIN pacientes p ON p.id = c.paciente_id
      WHERE c.medico_id = $1
        AND ($2::date IS NULL OR c.fecha::date = $2::date)
        AND c.estado = 'EN_SALA'
      ORDER BY c.hora_llegada ASC NULLS LAST, c.fecha ASC`,
    [medicoId, fecha || null]
  );
  return rows;
}

// Transiciones permitidas desde la interfaz (ATENDIDA solo la asigna el trigger en BD)
const ORIGENES = {
  CONFIRMADA: ['PROGRAMADA'],
  EN_SALA: ['CONFIRMADA'],
  NO_ASISTIO: ['PROGRAMADA', 'CONFIRMADA'],
  CANCELADA: ['PROGRAMADA', 'CONFIRMADA'],
};

async function cambiarEstado(citaId, estado, ctx) {
  if (!ORIGENES[estado]) {
    const e = new Error('Transición de estado no válida');
    e.status = 409;
    throw e;
  }
  if (!citaId || !UUID_REGEX.test(citaId)) {
    const e = new Error('Transición de estado no válida');
    e.status = 409;
    throw e;
  }

  return db.tx(ctx, async (c) => {
    const { rowCount } = await c.query(
      `UPDATE citas
          SET estado = $2::varchar,
              hora_llegada = CASE WHEN $2::varchar = 'EN_SALA' THEN now() ELSE hora_llegada END
        WHERE id = $1 AND estado = ANY($3::varchar[])`,
      [citaId, estado, ORIGENES[estado]]
    );
    if (!rowCount) {
      const e = new Error('Transición de estado no válida');
      e.status = 409;
      throw e;
    }
    return { ok: true, id: citaId, estado };
  });
}

/**
 * Consulta la información completa de una cita para la pantalla de gestión C.17.
 * @param {string} citaId UUID de la cita
 * @returns {Promise<object|null>}
 */
async function obtenerCitaGestion(citaId) {
  const { rows: [cita] } = await db.query(
    `SELECT c.id,
            c.paciente_id,
            p.nombres || ' ' || p.apellidos AS paciente,
            p.tipo_documento || ' ' || p.numero_documento AS paciente_documento,
            c.medico_id,
            u.nombre AS medico_nombre,
            c.fecha,
            to_char(c.fecha, 'DD/MM/YYYY HH24:MI') AS fecha_formateada,
            c.duracion_minutos,
            c.hora_fin,
            c.estado,
            c.cita_origen_id,
            c.motivo_cambio
       FROM citas c
       JOIN pacientes p ON p.id = c.paciente_id
       JOIN usuarios u ON u.id = c.medico_id
      WHERE c.id = $1`,
    [citaId]
  );
  return cita || null;
}

const ETIQUETAS_ESTADO_AUDITORIA = {
  EN_SALA: 'En sala de espera',
  NO_ASISTIO: 'No asistió',
};

function formatearEstadoAuditoria(estado) {
  return ETIQUETAS_ESTADO_AUDITORIA[estado] || estado;
}

/**
 * Parsea y formatea un registro de auditoría de cita para presentar un resumen legible.
 * @param {object} row Registro de la tabla auditoria
 * @returns {object}
 */
function formatearDetalleAuditoria(row) {
  let parsed = null;
  if (row.detalle) {
    if (typeof row.detalle === 'object') {
      parsed = row.detalle;
    } else {
      try {
        parsed = JSON.parse(row.detalle);
      } catch (_) {
        parsed = null;
      }
    }
  }

  let antes = null;
  let despues = null;
  let resumen = row.detalle || '';

  if (parsed && typeof parsed === 'object') {
    antes = parsed.antes || null;
    despues = parsed.despues || null;

    if (row.accion === 'INSERT') {
      let fechaStr = '';
      if (despues && despues.fecha) {
        const match = String(despues.fecha).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
        if (match) {
          const [, , mes, dia, hora, min] = match;
          fechaStr = `${dia}/${mes} ${hora}:${min}`;
        } else {
          fechaStr = String(despues.fecha).slice(0, 16);
        }
      }
      resumen = fechaStr
        ? `Creada ${fechaStr}`
        : `Creada (estado: ${formatearEstadoAuditoria(despues?.estado || 'PROGRAMADA')})`;
    } else if (row.accion === 'UPDATE') {
      const estadoAnt = antes?.estado;
      const estadoDes = despues?.estado;
      const motivo = despues?.motivo_cambio ? `: ${despues.motivo_cambio}` : '';

      if (estadoDes === 'REPROGRAMADA') {
        resumen = `REPROGRAMADA${motivo}`;
      } else if (estadoDes === 'CANCELADA') {
        resumen = `CANCELADA${motivo}`;
      } else if (estadoAnt && estadoDes && estadoAnt !== estadoDes) {
        resumen = `${formatearEstadoAuditoria(estadoAnt)} -> ${formatearEstadoAuditoria(estadoDes)}${motivo}`;
      } else if (despues?.motivo_cambio) {
        resumen = `Modificada${motivo}`;
      } else {
        resumen = 'Modificación de cita';
      }
    }
  }

  return {
    fecha: row.fecha,
    usuario: row.usuario || 'Sistema',
    accion: row.accion,
    detalle: resumen,
    resumen,
    antes,
    despues,
  };
}

/**
 * Consulta el historial de auditoría de una cita y sus citas relacionadas (origen / reprogramada).
 * @param {string} citaId UUID de la cita
 * @returns {Promise<Array<object>>}
 */
async function obtenerHistorialCita(citaId) {
  const { rows } = await db.query(
    `SELECT a.fecha, u.nombre AS usuario, a.accion, a.detalle
       FROM auditoria a
  LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.tabla_afectada = 'citas'
        AND a.registro_id IN (
          SELECT id FROM citas WHERE id = $1 OR cita_origen_id = $1
          UNION
          SELECT cita_origen_id FROM citas WHERE id = $1 AND cita_origen_id IS NOT NULL
        )
      ORDER BY a.fecha ASC`,
    [citaId]
  );

  return rows.map(formatearDetalleAuditoria);
}

/**
 * Reprograma una cita existente de forma transaccional:
 * 1. Pone la cita original en 'REPROGRAMADA' con motivo_cambio.
 * 2. Crea la nueva cita enlazada por cita_origen_id con misma duración y paciente.
 * 3. En caso de conflicto de franja (23P01), hace ROLLBACK y retorna alternativas libres.
 *
 * @param {string} citaId UUID de la cita original
 * @param {{ medico_id: string, fecha: string, motivo: string }} param1 Datos de reprogramación
 * @param {object} ctx Contexto de auditoría { usuarioId, ip }
 * @returns {Promise<{ cita_nueva_id: string, cita_origen_id: string }>}
 */
async function reprogramarCita(citaId, { medico_id, fecha, motivo }, ctx) {
  try {
    return await db.tx(ctx, async (client) => {
      // Paso 1: UPDATE citas SET estado = 'REPROGRAMADA', motivo_cambio = $motivo
      const updateRes = await client.query(
        `UPDATE citas
            SET estado = 'REPROGRAMADA', motivo_cambio = $1
          WHERE id = $2 AND estado IN ('PROGRAMADA', 'CONFIRMADA')
      RETURNING paciente_id, duracion_minutos`,
        [motivo, citaId]
      );

      if (updateRes.rowCount === 0) {
        const err = new Error('La cita no se encuentra en un estado que permita reprogramación o no existe');
        err.status = 409;
        err.codigo = 'ESTADO_INVALIDO';
        throw err;
      }

      const { paciente_id, duracion_minutos } = updateRes.rows[0];

      // Paso 2: INSERT INTO citas (...) con cita_origen_id
      const insertRes = await client.query(
        `INSERT INTO citas (paciente_id, medico_id, fecha, duracion_minutos, cita_origen_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [paciente_id, medico_id, fecha, duracion_minutos, citaId]
      );

      return {
        cita_nueva_id: insertRes.rows[0].id,
        cita_origen_id: citaId,
      };
    });
  } catch (err) {
    // Paso 3: Si salta código '23P01' (no_cruce_citas)
    if (err.code === '23P01') {
      err.status = 409;
      err.codigo = 'CRUCE_HORARIO';
      err.message = 'La franja fue tomada por otro usuario';
      const fechaSolo = typeof fecha === 'string' ? fecha.slice(0, 10) : '';
      try {
        const libres = (await franjasLibres(medico_id, fechaSolo))
          .filter((f) => f.estado === 'LIBRE');
        const pedida = Date.parse(fecha);
        libres.sort((a, b) => Math.abs(Date.parse(a.inicio) - pedida) - Math.abs(Date.parse(b.inicio) - pedida));
        err.alternativas = libres.slice(0, 3);
      } catch (_) {
        err.alternativas = [];
      }
    }
    throw err;
  }
}

/**
 * Cancela una cita médica de forma transaccional.
 *
 * @param {string} citaId UUID de la cita
 * @param {{ motivo: string }} param1 Motivo de la cancelación
 * @param {object} ctx Contexto de auditoría { usuarioId, ip }
 * @returns {Promise<{ ok: boolean, id: string }>}
 */
async function cancelarCita(citaId, { motivo }, ctx) {
  return db.tx(ctx, async (client) => {
    const res = await client.query(
      `UPDATE citas
          SET estado = 'CANCELADA', motivo_cambio = $1
        WHERE id = $2 AND estado IN ('PROGRAMADA', 'CONFIRMADA')
    RETURNING id`,
      [motivo, citaId]
    );

    if (res.rowCount === 0) {
      const err = new Error('La cita no se encuentra en un estado que permita cancelación');
      err.status = 409;
      err.codigo = 'ESTADO_INVALIDO';
      throw err;
    }

    return { ok: true, id: citaId };
  });
}

module.exports = {
  franjasLibres,
  agendar,
  agendaDiaria,
  obtenerIndicadoresAgenda,
  obtenerSalaEspera,
  cambiarEstado,
  obtenerPacienteConAfiliacion,
  obtenerPacienteAfiliacion,
  obtenerCitaGestion,
  obtenerHistorialCita,
  reprogramarCita,
  cancelarCita,
};
