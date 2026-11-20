// src/services/borrador.service.js — almacenamiento temporal de borradores clínicos (HIS-E-06, HIS-NF-06)
const db = require('../db');

/**
 * Normaliza el contenido para guardarlo en la columna JSONB.
 */
function normalizarContenido(contenido) {
  if (contenido === null || contenido === undefined) {
    return {};
  }
  if (typeof contenido === 'object') {
    return contenido;
  }
  if (typeof contenido === 'string') {
    try {
      return JSON.parse(contenido);
    } catch {
      return { texto: contenido };
    }
  }
  return { valor: contenido };
}

/**
 * Guarda o actualiza un borrador para un usuario, atención y sección.
 * Operación UPSERT sobre infra.borradores ejecutada con contexto de auditoría.
 */
async function guardar(usuarioId, atencionId, seccion, contenido, ctx) {
  const contenidoJson = normalizarContenido(contenido);
  const sql = `INSERT INTO infra.borradores (usuario_id, atencion_id, seccion, contenido, fecha)
               VALUES ($1, $2, $3, $4, now())
               ON CONFLICT (usuario_id, atencion_id, seccion)
               DO UPDATE SET contenido = EXCLUDED.contenido, fecha = now()
               RETURNING id, usuario_id, atencion_id, seccion, contenido, fecha`;
  const params = [usuarioId, atencionId, seccion, contenidoJson];

  if (ctx && typeof ctx.query === 'function') {
    const { rows } = await ctx.query(sql, params);
    return rows[0];
  }

  const safeCtx = (ctx && (ctx.usuarioId !== undefined || ctx.ip !== undefined))
    ? ctx
    : { usuarioId: usuarioId || '', ip: '' };

  const { rows } = await db.queryConCtx(safeCtx, sql, params);
  return rows[0];
}

/**
 * Obtiene el borrador actual de un usuario para una atención y sección específica.
 */
async function obtener(usuarioId, atencionId, seccion, ctx) {
  const sql = `SELECT contenido, fecha FROM infra.borradores WHERE usuario_id = $1 AND atencion_id = $2 AND seccion = $3`;
  const params = [usuarioId, atencionId, seccion];

  if (ctx && typeof ctx.query === 'function') {
    const { rows } = await ctx.query(sql, params);
    return rows[0] || null;
  }

  const safeCtx = (ctx && (ctx.usuarioId !== undefined || ctx.ip !== undefined))
    ? ctx
    : { usuarioId: usuarioId || '', ip: '' };

  const { rows } = await db.query(sql, params, safeCtx);
  return rows[0] || null;
}

/**
 * Elimina un borrador cuando el contenido ya ha sido consolidado en la historia clínica.
 */
async function eliminar(usuarioId, atencionId, seccion, ctx) {
  const sql = `DELETE FROM infra.borradores WHERE usuario_id = $1 AND atencion_id = $2 AND seccion = $3`;
  const params = [usuarioId, atencionId, seccion];

  if (ctx && typeof ctx.query === 'function') {
    await ctx.query(sql, params);
    return true;
  }

  const safeCtx = (ctx && (ctx.usuarioId !== undefined || ctx.ip !== undefined))
    ? ctx
    : { usuarioId: usuarioId || '', ip: '' };

  await db.queryConCtx(safeCtx, sql, params);
  return true;
}

module.exports = {
  guardar,
  obtener,
  eliminar,
};
