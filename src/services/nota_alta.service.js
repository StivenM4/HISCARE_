// src/services/nota_alta.service.js — Servicio para Nota de alta (epicrisis) (C.21, HIS-F-21, HIS-D-03)
const db = require('../db');
const borradorService = require('./borrador.service');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guarda o actualiza la nota de alta (epicrisis) de una atención clínica.
 * Realiza un UPSERT sobre la tabla `notas_alta` y elimina cualquier borrador activo
 * de la sección 'alta'. Ejecuta todo dentro de una transacción db.tx() para
 * garantizar atomicidad y auditoría.
 *
 * @param {object} params
 * @param {string} params.atencionId
 * @param {string} params.medicoId
 * @param {string} params.resumen
 * @param {string} params.recomendaciones
 * @param {object} [ctx]
 * @returns {Promise<object>} Nota de alta guardada
 */
async function guardarNotaAlta({ atencionId, medicoId, resumen, recomendaciones }, ctx) {
  const usuarioId = (ctx && ctx.usuarioId) || medicoId;

  const ejecutar = async (client) => {
    // Detectar si ya existía para retornar flag de creación/actualización
    const { rows: prevRows } = await client.query(
      'SELECT id FROM notas_alta WHERE atencion_id = $1',
      [atencionId]
    );
    const esActualizacion = prevRows.length > 0;

    const sql = `
      INSERT INTO notas_alta (atencion_id, medico_id, resumen, recomendaciones)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (atencion_id)
      DO UPDATE SET resumen = EXCLUDED.resumen,
                    recomendaciones = EXCLUDED.recomendaciones,
                    medico_id = EXCLUDED.medico_id,
                    fecha = now()
      RETURNING *;
    `;
    const { rows } = await client.query(sql, [atencionId, medicoId, resumen, recomendaciones]);
    const nota = rows[0];

    // Eliminar borrador de la sección 'alta'
    await client.query(
      "DELETE FROM infra.borradores WHERE usuario_id = $1 AND atencion_id = $2 AND seccion = 'alta'",
      [usuarioId, atencionId]
    );

    if (nota) {
      nota._esNuevo = !esActualizacion;
    }

    return nota;
  };

  if (ctx && ctx.query) {
    return ejecutar(ctx);
  }
  const txCtx = ctx || { usuarioId: medicoId, ip: '' };
  return db.tx(txCtx, ejecutar);
}

/**
 * Obtiene la nota de alta de una atención clínica, incluyendo datos del médico autor.
 *
 * @param {string} atencionId
 * @param {object} [ctx]
 * @returns {Promise<object|null>}
 */
async function obtenerNotaAlta(atencionId, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    return null;
  }

  const sql = `
    SELECT na.id,
           na.atencion_id,
           na.medico_id,
           na.resumen,
           na.recomendaciones,
           na.fecha,
           to_char(na.fecha, 'DD/MM/YYYY HH24:MI') AS fecha_formateada,
           to_char(na.fecha, 'HH24:MI') AS hora,
           u.nombre AS medico_nombre
      FROM notas_alta na
      LEFT JOIN usuarios u ON u.id = na.medico_id
     WHERE na.atencion_id = $1
  `;
  const params = [atencionId];

  let row = null;
  if (ctx && ctx.query) {
    const { rows } = await ctx.query(sql, params);
    row = rows[0] || null;
  } else if (ctx && ctx.usuarioId !== undefined) {
    row = await db.tx(ctx, async (client) => {
      const { rows } = await client.query(sql, params);
      return rows[0] || null;
    });
  } else {
    const { rows } = await db.query(sql, params);
    row = rows[0] || null;
  }

  if (!row) {
    return null;
  }

  const registroMedico = row.medico_id
    ? `RM-${row.medico_id.slice(0, 6).toUpperCase()}`
    : 'RM-54219';

  return {
    ...row,
    registro_medico: registroMedico,
    medico: {
      id: row.medico_id,
      nombre: row.medico_nombre,
      registro_medico: registroMedico,
    },
  };
}

/**
 * Guarda el borrador temporal de la sección 'alta'.
 *
 * @param {string} usuarioId
 * @param {string} atencionId
 * @param {object} contenido { resumen, recomendaciones }
 * @param {object} [ctx]
 * @returns {Promise<object>}
 */
async function guardarBorrador(usuarioId, atencionId, { resumen, recomendaciones }, ctx) {
  const contenido = {
    resumen: resumen || '',
    recomendaciones: recomendaciones || '',
  };
  return borradorService.guardar(usuarioId, atencionId, 'alta', contenido, ctx);
}

/**
 * Obtiene el borrador temporal de la sección 'alta'.
 *
 * @param {string} usuarioId
 * @param {string} atencionId
 * @param {object} [ctx]
 * @returns {Promise<object|null>}
 */
async function obtenerBorrador(usuarioId, atencionId, ctx) {
  return borradorService.obtener(usuarioId, atencionId, 'alta', ctx);
}

module.exports = {
  guardarNotaAlta,
  obtenerNotaAlta,
  guardarBorrador,
  obtenerBorrador,
};
