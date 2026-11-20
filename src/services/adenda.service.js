// src/services/adenda.service.js — Servicio de adendas clínicas inmutables (C.22, HIS-D-02, HIS-E-07, EDT-RNF-05)
const db = require('../db');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Consulta las adendas registradas para una atención clínica, uniendo con
 * la tabla de usuarios para obtener el nombre del autor y ordenadas cronológicamente.
 *
 * @param {string} atencionId - UUID de la atención
 * @param {object} [ctx] - Contexto de ejecución / transacción
 * @returns {Promise<Array<object>>} Lista de adendas con id, atencion_id, autor_id, autor_nombre, texto, fecha, fecha_formateada
 */
async function listarAdendas(atencionId, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    return [];
  }

  const sql = `
    SELECT a.id,
           a.atencion_id,
           a.autor_id,
           u.nombre AS autor_nombre,
           a.texto,
           a.fecha,
           to_char(a.fecha, 'DD/MM/YYYY HH24:MI:SS') AS fecha_formateada
      FROM adendas a
      JOIN usuarios u ON u.id = a.autor_id
     WHERE a.atencion_id = $1
     ORDER BY a.fecha ASC
  `;

  const ejecutar = async (client) => {
    const { rows } = await client.query(sql, [atencionId]);
    return rows;
  };

  if (ctx && ctx.query) {
    return ejecutar(ctx);
  }
  return ejecutar(db);
}

/**
 * Registra una adenda inmutable sobre una atención clínica que debe estar en estado CERRADA.
 * Ejecuta la inserción dentro de una transacción db.tx() respetando la auditoría y los
 * triggers de base de datos.
 *
 * @param {object} params
 * @param {string} params.atencionId - UUID de la atención
 * @param {string} params.autorId - UUID del usuario médico autor
 * @param {string} params.texto - Texto de la adenda
 * @param {object} [ctx] - Contexto de auditoría / sesión
 * @returns {Promise<object>} Adenda creada
 */
async function crearAdenda({ atencionId, autorId, texto }, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    const err = new Error('Atención no encontrada');
    err.status = 404;
    err.codigo = 'ATENCION_NO_ENCONTRADA';
    throw err;
  }

  const txCtx = (ctx && ctx.usuarioId !== undefined) ? ctx : { usuarioId: autorId || '', ip: '' };

  const ejecutar = async (client) => {
    // 1. Validar existencia y estado de la atención
    const { rows: [atencion] } = await client.query(
      'SELECT id, estado FROM atenciones WHERE id = $1',
      [atencionId]
    );

    if (!atencion) {
      const err = new Error('Atención no encontrada');
      err.status = 404;
      err.codigo = 'ATENCION_NO_ENCONTRADA';
      throw err;
    }

    if (atencion.estado !== 'CERRADA') {
      const err = new Error('Las adendas solo aplican a atenciones cerradas');
      err.status = 409;
      err.codigo = 'ATENCION_NO_CERRADA';
      throw err;
    }

    // 2. Inserción de la adenda
    const { rows: [adenda] } = await client.query(
      `INSERT INTO adendas (atencion_id, autor_id, texto)
       VALUES ($1, $2, $3)
       RETURNING id, atencion_id, autor_id, texto, fecha, to_char(fecha, 'DD/MM/YYYY HH24:MI:SS') AS fecha_formateada`,
      [atencionId, autorId, texto]
    );

    // 3. Enriquecer con nombre del autor
    const { rows: [autor] } = await client.query(
      'SELECT nombre FROM usuarios WHERE id = $1',
      [autorId]
    );
    if (autor && adenda) {
      adenda.autor_nombre = autor.nombre;
    }

    return adenda;
  };

  try {
    if (ctx && ctx.query) {
      return await ejecutar(ctx);
    }
    return await db.tx(txCtx, ejecutar);
  } catch (err) {
    if (err.code === 'P0001') {
      const e = new Error(err.message || 'Las adendas solo aplican a atenciones cerradas');
      e.status = 409;
      e.codigo = 'REGLA_DE_NEGOCIO';
      throw e;
    }
    throw err;
  }
}

module.exports = {
  listarAdendas,
  crearAdenda,
};
