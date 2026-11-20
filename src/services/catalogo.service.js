// src/services/catalogo.service.js — Catálogos y búsquedas predictivas (CIE-10 y CUPS)
const db = require('../db');

/**
 * Búsqueda predictiva en el catálogo de diagnósticos CIE-10 (C.20).
 * - Si q tiene longitud < 2, retorna array vacío.
 * - Si q inicia con formato de código CIE-10 (/^[A-Z]\d/i): busca por código prefijo.
 * - En caso contrario: busca por similitud trigram o coincidencia parcial en descripción.
 * - Filtra estrictamente códigos vigentes y activos (vigente_desde <= hoy <= vigente_hasta).
 * - Límite de 20 registros con tiempo de respuesta < 500 ms (UAT P-03).
 *
 * @param {string} q
 * @returns {Promise<Array<{ id: string, codigo: string, descripcion: string, activo: boolean, vigente_desde: string, vigente_hasta: string|null }>>}
 */
async function buscarCie10(q) {
  const query = (q || '').trim();
  if (query.length < 2) {
    return [];
  }

  // Búsqueda por código o prefijo de código (ej: I10, E11, R51)
  if (/^[A-Z]\d/i.test(query)) {
    const { rows } = await db.query(
      `SELECT id, codigo, descripcion, activo, vigente_desde, vigente_hasta
       FROM diagnosticos_cie10
       WHERE codigo ILIKE $1 || '%'
         AND activo = true
         AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE)
         AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
       ORDER BY codigo ASC
       LIMIT 20`,
      [query]
    );
    return rows;
  }

  // Búsqueda predictiva por descripción usando pg_trgm + ILIKE
  const { rows } = await db.query(
    `SELECT id, codigo, descripcion, activo, vigente_desde, vigente_hasta
     FROM diagnosticos_cie10
     WHERE (descripcion % $1 OR descripcion ILIKE '%' || $1 || '%')
       AND activo = true
       AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE)
       AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
     ORDER BY similarity(descripcion, $1) DESC, codigo ASC
     LIMIT 20`,
    [query]
  );
  return rows;
}

/**
 * Búsqueda predictiva en el catálogo de procedimientos CUPS (C.20, C.7).
 * - Si q es numérico (/^\d+$/): busca por prefijo de código CUPS.
 * - En caso contrario: busca por similitud trigram o coincidencia en descripción.
 * - Filtra estrictamente códigos vigentes y activos (vigente_desde <= hoy <= vigente_hasta).
 * - Retorna [{ id, codigo, descripcion, requiere_consentimiento, activo, vigente_desde, vigente_hasta }] hasta 20 registros.
 *
 * @param {string} q
 * @returns {Promise<Array<{ id: string, codigo: string, descripcion: string, requiere_consentimiento: boolean, activo: boolean, vigente_desde: string, vigente_hasta: string|null }>>}
 */
async function buscarCups(q) {
  const query = (q || '').trim();
  if (query.length < 1) {
    return [];
  }

  // Búsqueda por prefijo numérico de código CUPS (ej: 9022, 8902)
  if (/^\d+$/.test(query)) {
    const { rows } = await db.query(
      `SELECT id, codigo, descripcion, requiere_consentimiento, activo, vigente_desde, vigente_hasta
       FROM procedimientos_cups
       WHERE codigo ILIKE $1 || '%'
         AND activo = true
         AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE)
         AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
       ORDER BY codigo ASC
       LIMIT 20`,
      [query]
    );
    return rows;
  }

  // Búsqueda predictiva por descripción usando pg_trgm + ILIKE
  const { rows } = await db.query(
    `SELECT id, codigo, descripcion, requiere_consentimiento, activo, vigente_desde, vigente_hasta
     FROM procedimientos_cups
     WHERE (descripcion % $1 OR descripcion ILIKE '%' || $1 || '%')
       AND activo = true
       AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE)
       AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
     ORDER BY similarity(descripcion, $1) DESC, codigo ASC
     LIMIT 20`,
    [query]
  );
  return rows;
}

module.exports = {
  buscarCie10,
  buscarCups,
};
