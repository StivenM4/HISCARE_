// src/services/aseguradora.service.js — servicio del catálogo de EPS y aseguradoras (C.14, HIS-F-06, PAC-04, PAC-08)
const db = require('../db');
const { Conflicto, NoEncontrado } = require('../db/errores');

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Valida si una cadena cumple con el formato canónico de UUID v4.
 * @param {string} id
 * @returns {boolean}
 */
function esUUID(id) {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

/**
 * Retorna la lista de aseguradoras con el conteo de afiliados activos.
 * Permite filtrar por texto de búsqueda `q`, `tipo_plan` exacto y bandera `todas`.
 *
 * @param {object} [filtros={}]
 * @param {string} [filtros.q] - Búsqueda case-insensitive sobre el nombre
 * @param {string} [filtros.tipo_plan] - Tipo de plan exacto
 * @param {boolean} [filtros.todas] - Si es false/falsy, solo incluye entidades con activo = true
 * @returns {Promise<Array<{id: string, nombre: string, tipo_plan: string, activo: boolean, afiliados: number}>>}
 */
async function listarAseguradoras({ q, tipo_plan, todas } = {}) {
  let sql = `
    SELECT a.id, a.nombre, a.tipo_plan, a.activo, count(pa.id)::int AS afiliados
    FROM aseguradoras a
    LEFT JOIN paciente_aseguradora pa ON pa.aseguradora_id = a.id AND pa.activo = true
    WHERE 1=1
  `;
  const params = [];

  const mostrarTodas = todas === true || todas === 'true' || todas === 1 || todas === '1';
  if (!mostrarTodas) {
    sql += ' AND a.activo = true';
  }

  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    sql += ` AND a.nombre ILIKE $${params.length}`;
  }

  if (tipo_plan && String(tipo_plan).trim()) {
    params.push(String(tipo_plan).trim());
    sql += ` AND a.tipo_plan = $${params.length}`;
  }

  sql += `
    GROUP BY a.id, a.nombre, a.tipo_plan, a.activo
    ORDER BY a.nombre ASC
  `;

  const { rows } = await db.query(sql, params);
  return rows;
}

/**
 * Obtiene el detalle de una aseguradora por su ID con su conteo de afiliados activos.
 * Lanza NoEncontrado (404) si el ID no existe o no tiene formato válido.
 *
 * @param {string} id - UUID de la aseguradora
 * @returns {Promise<{id: string, nombre: string, tipo_plan: string, activo: boolean, fecha_creacion: Date, fecha_modificacion: Date, afiliados: number}>}
 */
async function obtenerAseguradoraPorId(id) {
  if (!esUUID(id)) {
    throw new NoEncontrado('Aseguradora no encontrada');
  }

  const sql = `
    SELECT a.id, a.nombre, a.tipo_plan, a.activo, a.fecha_creacion, a.fecha_modificacion, count(pa.id)::int AS afiliados
    FROM aseguradoras a
    LEFT JOIN paciente_aseguradora pa ON pa.aseguradora_id = a.id AND pa.activo = true
    WHERE a.id = $1
    GROUP BY a.id, a.nombre, a.tipo_plan, a.activo, a.fecha_creacion, a.fecha_modificacion
  `;

  const { rows } = await db.query(sql, [id.trim()]);
  if (rows.length === 0) {
    throw new NoEncontrado('Aseguradora no encontrada');
  }

  return rows[0];
}

/**
 * Crea una nueva entidad aseguradora en una transacción con contexto de auditoría.
 * Valida unicidad de nombre de forma case-insensitive.
 *
 * @param {object} datos
 * @param {string} datos.nombre
 * @param {string} datos.tipo_plan
 * @param {boolean} [datos.activo=true]
 * @param {object} [ctx={}]
 * @returns {Promise<{id: string, nombre: string, tipo_plan: string, activo: boolean, fecha_creacion: Date, fecha_modificacion: Date}>}
 */
async function crearAseguradora({ nombre, tipo_plan, activo }, ctx = {}) {
  const nombreLimpio = (nombre || '').trim();
  const tipoPlanLimpio = (tipo_plan || '').trim();
  const activoVal = activo !== undefined ? Boolean(activo) : true;
  const safeCtx = ctx || {};

  return await db.tx(safeCtx, async (client) => {
    const { rows: existente } = await client.query(
      'SELECT id FROM aseguradoras WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))',
      [nombreLimpio]
    );
    if (existente.length > 0) {
      throw new Conflicto('Ya existe una aseguradora con este nombre', 'DUPLICADO');
    }

    try {
      const { rows } = await client.query(
        `INSERT INTO aseguradoras (nombre, tipo_plan, activo)
         VALUES ($1, $2, $3)
         RETURNING id, nombre, tipo_plan, activo, fecha_creacion, fecha_modificacion`,
        [nombreLimpio, tipoPlanLimpio, activoVal]
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new Conflicto('Ya existe una aseguradora con este nombre', 'DUPLICADO');
      }
      throw err;
    }
  });
}

/**
 * Actualiza una aseguradora existente comprobando que no colisione con el nombre de otra entidad.
 *
 * @param {string} id
 * @param {object} datos
 * @param {string} datos.nombre
 * @param {string} datos.tipo_plan
 * @param {boolean} [datos.activo]
 * @param {object} [ctx={}]
 * @returns {Promise<{id: string, nombre: string, tipo_plan: string, activo: boolean, fecha_creacion: Date, fecha_modificacion: Date}>}
 */
async function actualizarAseguradora(id, { nombre, tipo_plan, activo }, ctx = {}) {
  if (!esUUID(id)) {
    throw new NoEncontrado('Aseguradora no encontrada');
  }

  const nombreLimpio = (nombre || '').trim();
  const tipoPlanLimpio = (tipo_plan || '').trim();
  const safeCtx = ctx || {};

  return await db.tx(safeCtx, async (client) => {
    const { rows: existente } = await client.query(
      'SELECT id, nombre, tipo_plan, activo FROM aseguradoras WHERE id = $1',
      [id]
    );
    if (existente.length === 0) {
      throw new NoEncontrado('Aseguradora no encontrada');
    }

    const { rows: duplicado } = await client.query(
      'SELECT id FROM aseguradoras WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) AND id <> $2',
      [nombreLimpio, id]
    );
    if (duplicado.length > 0) {
      throw new Conflicto('Ya existe otra aseguradora con este nombre', 'DUPLICADO');
    }

    const nuevoActivo = activo !== undefined ? Boolean(activo) : existente[0].activo;

    try {
      const { rows } = await client.query(
        `UPDATE aseguradoras
         SET nombre = $1, tipo_plan = $2, activo = $3, fecha_modificacion = now()
         WHERE id = $4
         RETURNING id, nombre, tipo_plan, activo, fecha_creacion, fecha_modificacion`,
        [nombreLimpio, tipoPlanLimpio, nuevoActivo, id]
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new Conflicto('Ya existe otra aseguradora con este nombre', 'DUPLICADO');
      }
      throw err;
    }
  });
}

/**
 * Cambia el estado activo (vigente/no vigente) de una aseguradora.
 *
 * @param {string} id
 * @param {boolean} activo
 * @param {object} [ctx={}]
 * @returns {Promise<{id: string, nombre: string, tipo_plan: string, activo: boolean, fecha_creacion: Date, fecha_modificacion: Date}>}
 */
async function cambiarEstadoAseguradora(id, activo, ctx = {}) {
  if (!esUUID(id)) {
    throw new NoEncontrado('Aseguradora no encontrada');
  }

  const activoVal = Boolean(activo);
  const safeCtx = ctx || {};

  return await db.tx(safeCtx, async (client) => {
    const { rows } = await client.query(
      `UPDATE aseguradoras
       SET activo = $1, fecha_modificacion = now()
       WHERE id = $2
       RETURNING id, nombre, tipo_plan, activo, fecha_creacion, fecha_modificacion`,
      [activoVal, id]
    );
    if (rows.length === 0) {
      throw new NoEncontrado('Aseguradora no encontrada');
    }
    return rows[0];
  });
}

/**
 * Elimina una aseguradora si y solo si no cuenta con afiliaciones asociadas (activas ni inactivas).
 * Si tiene afiliados, arroja Conflicto (409) con código TIENE_AFILIADOS.
 *
 * @param {string} id
 * @param {object} [ctx={}]
 * @returns {Promise<{ok: boolean, id: string}>}
 */
async function eliminarAseguradora(id, ctx = {}) {
  if (!esUUID(id)) {
    throw new NoEncontrado('Aseguradora no encontrada');
  }

  const safeCtx = ctx || {};

  return await db.tx(safeCtx, async (client) => {
    const { rows: existente } = await client.query(
      'SELECT id FROM aseguradoras WHERE id = $1',
      [id]
    );
    if (existente.length === 0) {
      throw new NoEncontrado('Aseguradora no encontrada');
    }

    const { rows: afi } = await client.query(
      'SELECT count(id)::int AS total FROM paciente_aseguradora WHERE aseguradora_id = $1',
      [id]
    );
    if (afi[0] && afi[0].total > 0) {
      throw new Conflicto(
        'La entidad tiene afiliaciones asociadas: no puede eliminarse, solo marcarse como no vigente',
        'TIENE_AFILIADOS'
      );
    }

    try {
      const { rowCount } = await client.query(
        'DELETE FROM aseguradoras WHERE id = $1',
        [id]
      );
      if (rowCount === 0) {
        throw new NoEncontrado('Aseguradora no encontrada');
      }
      return { ok: true, id };
    } catch (err) {
      if (err.code === '23503') {
        throw new Conflicto(
          'La entidad tiene afiliaciones asociadas: no puede eliminarse, solo marcarse como no vigente',
          'TIENE_AFILIADOS'
        );
      }
      throw err;
    }
  });
}

module.exports = {
  esUUID,
  listarAseguradoras,
  obtenerAseguradoraPorId,
  crearAseguradora,
  actualizarAseguradora,
  cambiarEstadoAseguradora,
  eliminarAseguradora,
};
