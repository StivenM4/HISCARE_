// src/services/antecedente.service.js — servicio de antecedentes clínicos de la historia clínica (C.5)
const db = require('../db');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIPOS_VALIDOS = [
  'Patologico',
  'Quirurgico',
  'Alergico',
  'Farmacologico',
  'Familiar',
  'Ginecologico',
];

/**
 * Lista los antecedentes de una historia clínica ordenados por tipo y fecha_creacion DESC.
 * Opcionalmente filtra por tipo de antecedente.
 */
async function listarPorHistoria(historiaId, tipo = null) {
  if (!historiaId || !UUID_REGEX.test(historiaId)) {
    return [];
  }

  let sql = `
    SELECT id, tipo, descripcion,
           to_char(fecha_creacion, 'DD/MM/YYYY HH24:MI') AS fecha_formateada,
           fecha_creacion
      FROM antecedentes
     WHERE historia_id = $1
  `;
  const params = [historiaId];

  if (tipo) {
    sql += ' AND tipo = $2';
    params.push(tipo);
  }

  sql += ' ORDER BY tipo, fecha_creacion DESC';

  const { rows } = await db.query(sql, params);
  return rows;
}

/**
 * Obtiene todos los antecedentes de la historia ordenados por tipo y fecha_creacion DESC.
 * Agrupa en un objeto Node por tipo con claves:
 * 'Patologico', 'Quirurgico', 'Alergico', 'Farmacologico', 'Familiar', 'Ginecologico'.
 * Si no hay registros para un tipo, la clave contiene un array vacío [].
 */
async function listarAgrupadosPorHistoria(historiaId) {
  const agrupados = {
    Patologico: [],
    Quirurgico: [],
    Alergico: [],
    Farmacologico: [],
    Familiar: [],
    Ginecologico: [],
  };

  if (!historiaId || !UUID_REGEX.test(historiaId)) {
    return agrupados;
  }

  const lista = await listarPorHistoria(historiaId);
  for (const ant of lista) {
    if (Array.isArray(agrupados[ant.tipo])) {
      agrupados[ant.tipo].push(ant);
    }
  }

  return agrupados;
}

/**
 * Inserta un antecedente en la historia clínica dentro de una transacción con contexto de auditoría.
 * Ejecuta INSERT INTO antecedentes (historia_id, tipo, descripcion) VALUES ($1, $2, $3)
 * RETURNING id, tipo, descripcion, fecha_creacion, to_char(...) as fecha_formateada.
 */
async function crearAntecedente({ historiaId, tipo, descripcion, ctx }) {
  if (!historiaId || !UUID_REGEX.test(historiaId)) {
    const err = new Error('Historia clínica no encontrada');
    err.status = 404;
    err.codigo = 'HISTORIA_NO_ENCONTRADA';
    throw err;
  }

  return db.tx(ctx, async (c) => {
    const { rows: [nuevo] } = await c.query(
      `INSERT INTO antecedentes (historia_id, tipo, descripcion)
       VALUES ($1, $2, $3)
       RETURNING id, tipo, descripcion, fecha_creacion,
                 to_char(fecha_creacion, 'DD/MM/YYYY HH24:MI') AS fecha_formateada`,
      [historiaId, tipo, descripcion]
    );
    return nuevo;
  });
}

/**
 * Registra auditoría SELECT_CONFIDENTIAL sobre la historia clínica en db.tx con contexto.
 */
async function auditarConsultaHistoria(historiaId, ctx) {
  if (!historiaId || !UUID_REGEX.test(historiaId)) {
    return null;
  }

  return db.tx(ctx, async (c) => {
    await c.query("SELECT fn_auditar_consulta('historias_clinicas', $1)", [historiaId]);
  });
}

/**
 * Helper para consultar las descripciones de antecedentes de tipo 'Alergico' de esa historia clínica.
 * Retorna un arreglo de strings con cada descripción de alergia.
 */
async function obtenerAlergiasTexto(historiaId) {
  if (!historiaId || !UUID_REGEX.test(historiaId)) {
    return [];
  }

  const { rows } = await db.query(
    `SELECT descripcion
       FROM antecedentes
      WHERE historia_id = $1 AND tipo = 'Alergico'
      ORDER BY fecha_creacion ASC`,
    [historiaId]
  );

  return rows.map((r) => r.descripcion);
}

module.exports = {
  TIPOS_VALIDOS,
  listarPorHistoria,
  listarAgrupadosPorHistoria,
  crearAntecedente,
  auditarConsultaHistoria,
  obtenerAlergiasTexto,
};
