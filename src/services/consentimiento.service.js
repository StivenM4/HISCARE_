// src/services/consentimiento.service.js — Servicio de consentimientos informados (C.19)
const db = require('../db');
const { listaTipos, TIPOS_CONSENTIMIENTO } = require('../config/consentimientos');

/**
 * Lista todos los consentimientos médicos asociados a una atención clínica.
 * @param {string} atencionId - UUID de la atención
 * @returns {Promise<Array>} Lista de consentimientos ordenados cronológicamente descendente
 */
async function listarPorAtencion(atencionId) {
  const sql = `
    SELECT id,
           tipo,
           descripcion,
           to_char(fecha, 'YYYY-MM-DD') AS fecha,
           to_char(fecha, 'DD/MM/YYYY') AS fecha_formateada,
           firmado,
           firmado_por,
           fecha_creacion
    FROM consentimientos_medicos
    WHERE atencion_id = $1
    ORDER BY fecha DESC, fecha_creacion DESC
  `;
  const { rows } = await db.query(sql, [atencionId]);
  return rows;
}

/**
 * Registra un nuevo consentimiento médico informado dentro de una transacción que fija
 * las variables de sesión para los triggers de auditoría y validación.
 * Si la atención está cerrada, el trigger trg_consentimientos_medicos_bloqueo lanza P0001.
 *
 * @param {Object} datos - { atencionId, tipo, descripcion, fecha, firmado, firmado_por }
 * @param {Object} ctx - Contexto de auditoría { usuarioId, ip }
 * @returns {Promise<Object>} Consentimiento recién insertado con fechas formateadas
 */
async function crearConsentimiento({ atencionId, tipo, descripcion, fecha, firmado, firmado_por }, ctx) {
  const esFirmado = Boolean(firmado === true || firmado === 'true' || firmado === 1 || firmado === '1');
  const firmante = esFirmado ? (firmado_por ? String(firmado_por).trim().toUpperCase() : null) : null;
  const fechaValor = (fecha && String(fecha).trim()) ? String(fecha).trim() : null;

  return db.tx(ctx, async (client) => {
    const sql = `
      INSERT INTO consentimientos_medicos (
        atencion_id,
        tipo,
        descripcion,
        fecha,
        firmado,
        firmado_por
      )
      VALUES (
        $1,
        $2,
        $3,
        COALESCE($4::date, CURRENT_DATE),
        $5,
        $6
      )
      RETURNING id,
                atencion_id,
                tipo,
                descripcion,
                to_char(fecha, 'YYYY-MM-DD') AS fecha,
                to_char(fecha, 'DD/MM/YYYY') AS fecha_formateada,
                firmado,
                firmado_por,
                fecha_creacion
    `;

    const params = [
      atencionId,
      tipo ? String(tipo).trim() : '',
      descripcion ? String(descripcion).trim() : '',
      fechaValor,
      esFirmado,
      firmante
    ];

    const { rows } = await client.query(sql, params);
    return rows[0];
  });
}

/**
 * Actualiza el estado de un consentimiento médico a firmado (firmado = true, firmado_por).
 * Ejecuta la actualización dentro de una transacción que fija las variables de sesión para auditoría.
 *
 * @param {Object} params - { atencionId, consentimientoId, firmadoPor }
 * @param {Object} ctx - Contexto de auditoría { usuarioId, ip }
 * @returns {Promise<Object|null>} Consentimiento actualizado con fechas formateadas o null si no existe
 */
async function firmarConsentimiento({ atencionId, consentimientoId, firmadoPor }, ctx) {
  const norm = String(firmadoPor || '').trim().toUpperCase();
  const firmante = norm === 'ACUDIENTE' ? 'ACUDIENTE' : 'PACIENTE';

  return db.tx(ctx, async (client) => {
    const sql = `
      UPDATE consentimientos_medicos
      SET firmado = true,
          firmado_por = $1
      WHERE id = $2 AND atencion_id = $3
      RETURNING id,
                atencion_id,
                tipo,
                descripcion,
                to_char(fecha, 'YYYY-MM-DD') AS fecha,
                to_char(fecha, 'DD/MM/YYYY') AS fecha_formateada,
                firmado,
                firmado_por,
                fecha_creacion
    `;

    const params = [firmante, consentimientoId, atencionId];
    const { rows } = await client.query(sql, params);
    return rows[0] || null;
  });
}

/**
 * Retorna la lista de tipos de consentimiento disponibles.
 * @returns {string[]}
 */
function obtenerTipos() {
  return listaTipos();
}

module.exports = {
  listarPorAtencion,
  crearConsentimiento,
  firmarConsentimiento,
  obtenerTipos,
  TIPOS_CONSENTIMIENTO,
};

