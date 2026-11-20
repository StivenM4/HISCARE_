// src/services/afiliacion.service.js — servicio de afiliación y vigencia de salud (C.14, C.15)
const db = require('../db');

/**
 * Convierte un valor de fecha (Date o string) a formato YYYY-MM-DD.
 * @param {Date|string|null} f
 * @returns {string|null}
 */
function aFechaISO(f) {
  if (!f) return null;
  if (typeof f === 'string') {
    return f.substring(0, 10);
  }
  if (f instanceof Date && !isNaN(f.getTime())) {
    const y = f.getFullYear();
    const m = String(f.getMonth() + 1).padStart(2, '0');
    const d = String(f.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

/**
 * Determina si una afiliación se encuentra vigente.
 * Retorna true si afiliacion.activo === true y la fecha actual está entre
 * fecha_inicio y fecha_fin (o si las fechas son nulas/abiertas respetando el rango).
 *
 * @param {object} afiliacion
 * @returns {boolean}
 */
function estaVigente(afiliacion) {
  if (!afiliacion || afiliacion.activo !== true) {
    return false;
  }

  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const d = String(hoy.getDate()).padStart(2, '0');
  const hoyStr = `${y}-${m}-${d}`;

  if (afiliacion.fecha_inicio) {
    const inicioStr = aFechaISO(afiliacion.fecha_inicio);
    if (inicioStr && hoyStr < inicioStr) {
      return false;
    }
  }

  if (afiliacion.fecha_fin) {
    const finStr = aFechaISO(afiliacion.fecha_fin);
    if (finStr && hoyStr > finStr) {
      return false;
    }
  }

  return true;
}

/**
 * Consulta la afiliación más reciente o activa de un paciente y calcula su vigencia.
 *
 * @param {string} pacienteId - UUID del paciente
 * @param {object} [client] - Cliente de base de datos opcional (para transacciones)
 * @returns {Promise<object|null>}
 */
async function obtenerAfiliacion(pacienteId, client = null) {
  if (!pacienteId) return null;

  const sql = `
    SELECT
      pa.id,
      pa.aseguradora_id,
      s.nombre AS eps,
      s.nombre AS aseguradora_nombre,
      s.tipo_plan,
      pa.tipo_usuario,
      pa.numero_contrato,
      to_char(pa.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
      to_char(pa.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
      pa.activo
    FROM paciente_aseguradora pa
    JOIN aseguradoras s ON s.id = pa.aseguradora_id
    WHERE pa.paciente_id = $1
    ORDER BY pa.activo DESC, pa.fecha_inicio DESC NULLS LAST, pa.fecha_creacion DESC
    LIMIT 1
  `;

  const ejecutor = client || db;
  const { rows } = await ejecutor.query(sql, [pacienteId]);

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const vigente = estaVigente(row);

  return {
    id: row.id,
    aseguradora_id: row.aseguradora_id,
    eps: row.eps,
    aseguradora_nombre: row.aseguradora_nombre,
    tipo_plan: row.tipo_plan,
    tipo_usuario: row.tipo_usuario,
    numero_contrato: row.numero_contrato,
    fecha_inicio: row.fecha_inicio,
    fecha_fin: row.fecha_fin,
    activo: row.activo,
    vigente,
  };
}

module.exports = {
  estaVigente,
  obtenerAfiliacion,
};
