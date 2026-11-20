// src/services/metricas.service.js — indicadores de la jornada y consultas de dashboard (C.2)
const db = require('../db');

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

/**
 * Calcula las 4 métricas del dashboard en una única consulta con CTE:
 * { citasHoy, enSala, ordenesPendientes, alertas }
 * Si el rol del usuario es 'MEDICO', filtra citas y órdenes por su ID.
 * Si es otro rol, calcula los indicadores a nivel global (alertas siempre por usuario).
 *
 * @param {Object|string} usuario - Objeto usuario { id, rol, ... } o id de usuario
 * @param {string} [fecha] - Fecha en formato YYYY-MM-DD
 * @returns {Promise<{ citasHoy: number, enSala: number, ordenesPendientes: number, alertas: number }>}
 */
async function dashboard(usuario, fecha = hoy()) {
  const fechaConsulta = fecha || hoy();
  const usuarioId = typeof usuario === 'object' && usuario !== null ? usuario.id : usuario;
  const esMedico = typeof usuario === 'object' && usuario !== null && usuario.rol === 'MEDICO';

  let sql;
  let params;

  if (esMedico) {
    sql = `
      WITH kpi_citas AS (
        SELECT
          count(*)::int AS "citasHoy",
          count(*) FILTER (WHERE estado = 'EN_SALA')::int AS "enSala"
        FROM citas
        WHERE fecha::date = $1::date
          AND estado NOT IN ('CANCELADA', 'REPROGRAMADA')
          AND medico_id = $2
      ),
      kpi_ordenes AS (
        SELECT count(*)::int AS "ordenesPendientes"
        FROM ordenes_diagnosticas od
        JOIN atenciones a ON a.id = od.atencion_id
        WHERE od.estado = 'PENDIENTE'
          AND a.medico_id = $2
      ),
      kpi_alertas AS (
        SELECT count(*)::int AS alertas
        FROM notificaciones
        WHERE usuario_id = $2
          AND NOT leido
      )
      SELECT
        c."citasHoy",
        c."enSala",
        o."ordenesPendientes",
        a.alertas
      FROM kpi_citas c
      CROSS JOIN kpi_ordenes o
      CROSS JOIN kpi_alertas a;
    `;
    params = [fechaConsulta, usuarioId];
  } else {
    sql = `
      WITH kpi_citas AS (
        SELECT
          count(*)::int AS "citasHoy",
          count(*) FILTER (WHERE estado = 'EN_SALA')::int AS "enSala"
        FROM citas
        WHERE fecha::date = $1::date
          AND estado NOT IN ('CANCELADA', 'REPROGRAMADA')
      ),
      kpi_ordenes AS (
        SELECT count(*)::int AS "ordenesPendientes"
        FROM ordenes_diagnosticas
        WHERE estado = 'PENDIENTE'
      ),
      kpi_alertas AS (
        SELECT count(*)::int AS alertas
        FROM notificaciones
        WHERE usuario_id = $2
          AND NOT leido
      )
      SELECT
        c."citasHoy",
        c."enSala",
        o."ordenesPendientes",
        a.alertas
      FROM kpi_citas c
      CROSS JOIN kpi_ordenes o
      CROSS JOIN kpi_alertas a;
    `;
    params = [fechaConsulta, usuarioId || null];
  }

  const { rows } = await db.query(sql, params);
  const r = rows[0] || {};
  return {
    citasHoy: Number(r.citasHoy || 0),
    enSala: Number(r.enSala || 0),
    ordenesPendientes: Number(r.ordenesPendientes || 0),
    alertas: Number(r.alertas || 0),
  };
}

/**
 * Consulta las citas del día con hora, paciente, médico y estado.
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.fecha] - Fecha en formato YYYY-MM-DD
 * @param {string} [filtros.medicoId] - UUID del médico para filtrar
 * @param {Object} [filtros.usuario] - Objeto usuario de sesión
 * @returns {Promise<Array<{ cita_id: string, hora: string, paciente_id: string, paciente: string, medico: string, estado: string }>>}
 */
async function agendaDia({ fecha = hoy(), medicoId, usuario } = {}) {
  const fechaConsulta = fecha || hoy();
  let sql = `
    SELECT
      c.id AS cita_id,
      c.id AS id,
      to_char(c.fecha, 'HH24:MI') AS hora,
      p.id AS paciente_id,
      p.nombres || ' ' || p.apellidos AS paciente,
      u.nombre AS medico,
      c.estado
    FROM citas c
    JOIN pacientes p ON p.id = c.paciente_id
    JOIN usuarios u ON u.id = c.medico_id
    WHERE c.fecha::date = $1::date
      AND c.estado <> 'REPROGRAMADA'
  `;
  const params = [fechaConsulta];

  const idMedicoFiltro = (usuario && usuario.rol === 'MEDICO') ? usuario.id : medicoId;
  if (idMedicoFiltro) {
    params.push(idMedicoFiltro);
    sql += ` AND c.medico_id = $${params.length}`;
  }

  sql += ` ORDER BY c.fecha ASC`;

  const { rows } = await db.query(sql, params);
  return rows.map((r) => ({
    cita_id: r.cita_id,
    id: r.cita_id,
    hora: r.hora,
    paciente_id: r.paciente_id,
    paciente: r.paciente,
    medico: r.medico,
    estado: r.estado,
  }));
}

/**
 * Cuenta las notificaciones no leídas de un usuario dado.
 *
 * @param {string} usuarioId - UUID del usuario
 * @returns {Promise<number>}
 */
async function conteoNotificaciones(usuarioId) {
  if (!usuarioId) return 0;
  const { rows } = await db.query(
    `SELECT count(*)::int AS conteo FROM notificaciones WHERE usuario_id = $1 AND NOT leido`,
    [usuarioId]
  );
  return rows[0] ? Number(rows[0].conteo || 0) : 0;
}

module.exports = {
  dashboard,
  agendaDia,
  conteoNotificaciones,
  hoy,
};
