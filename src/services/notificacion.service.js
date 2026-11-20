// src/services/notificacion.service.js — Servicio para Centro de notificaciones y alertas clínicas (Pantalla C.11, HIS-E-09)
const db = require('../db');
const { NoEncontrado } = require('../db/errores');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retorna el conteo de notificaciones no leídas de un usuario.
 * @param {string} usuarioId - UUID del usuario autenticado
 * @returns {Promise<{ conteo: number }>}
 */
async function conteoNoLeidas(usuarioId) {
  if (!usuarioId || !UUID_REGEX.test(usuarioId)) {
    return { conteo: 0 };
  }

  const { rows } = await db.query(
    'SELECT count(*)::int AS conteo FROM notificaciones WHERE usuario_id = $1 AND NOT leido',
    [usuarioId]
  );

  return { conteo: rows[0] ? Number(rows[0].conteo || 0) : 0 };
}

/**
 * Consulta paginada de notificaciones filtradas por usuario.
 * @param {string} usuarioId - UUID del usuario autenticado
 * @param {object} [opciones] - Opciones de filtrado y paginación
 * @param {number} [opciones.limite=10] - Cantidad de registros por página
 * @param {number} [opciones.pagina=1] - Número de página actual
 * @param {boolean|string} [opciones.leido] - Filtro de estado de lectura (true, false o undefined)
 * @param {string} [opciones.prioridad] - Filtro de prioridad ('NORMAL', 'CRITICA')
 * @returns {Promise<{ notificaciones: Array, total: number, pagina: number, totalPaginas: number, limite: number }>}
 */
async function listarNotificaciones(usuarioId, opciones = {}) {
  if (!usuarioId || !UUID_REGEX.test(usuarioId)) {
    return { notificaciones: [], total: 0, pagina: 1, totalPaginas: 1, limite: 10 };
  }

  const limite = Math.max(1, parseInt(opciones.limite, 10) || 10);
  const pagina = Math.max(1, parseInt(opciones.pagina || opciones.page, 10) || 1);
  const offset = (pagina - 1) * limite;

  const whereClauses = ['usuario_id = $1'];
  const params = [usuarioId];

  // Filtro opcional por leído / no leído
  if (opciones.leido !== undefined && opciones.leido !== null && opciones.leido !== '') {
    let leidoVal;
    if (
      opciones.leido === true ||
      opciones.leido === 'true' ||
      opciones.leido === 1 ||
      opciones.leido === '1' ||
      opciones.leido === 'leidas'
    ) {
      leidoVal = true;
    } else if (
      opciones.leido === false ||
      opciones.leido === 'false' ||
      opciones.leido === 0 ||
      opciones.leido === '0' ||
      opciones.leido === 'no_leidas' ||
      opciones.leido === 'no-leidas'
    ) {
      leidoVal = false;
    }

    if (leidoVal !== undefined) {
      params.push(leidoVal);
      whereClauses.push(`leido = $${params.length}`);
    }
  }

  // Filtro opcional por prioridad
  if (opciones.prioridad && typeof opciones.prioridad === 'string' && opciones.prioridad.trim() !== '') {
    const pUpper = opciones.prioridad.trim().toUpperCase();
    if (pUpper === 'NORMAL' || pUpper === 'CRITICA') {
      params.push(pUpper);
      whereClauses.push(`prioridad = $${params.length}`);
    }
  }

  const whereSql = whereClauses.join(' AND ');

  // Conteo total
  const countSql = `SELECT count(*)::int AS total FROM notificaciones WHERE ${whereSql}`;
  const { rows: countRows } = await db.query(countSql, params);
  const total = countRows[0] ? Number(countRows[0].total || 0) : 0;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));

  // Consulta paginada ordenada por fecha DESC
  const listParams = [...params, limite, offset];
  const listSql = `
    SELECT id, mensaje, resultado_id, leido, prioridad, fecha
    FROM notificaciones
    WHERE ${whereSql}
    ORDER BY fecha DESC
    LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
  `;
  const { rows: notificaciones } = await db.query(listSql, listParams);

  return {
    notificaciones,
    total,
    pagina,
    totalPaginas,
    limite
  };
}

/**
 * Marca una notificación como leída.
 * @param {string} id - UUID de la notificación
 * @param {string} usuarioId - UUID del usuario autenticado
 * @returns {Promise<{ id: string }>} Notificación actualizada
 * @throws {NoEncontrado} Si no existe o no pertenece al usuario (404)
 */
async function marcarLeida(id, usuarioId) {
  if (!id || !usuarioId || !UUID_REGEX.test(id) || !UUID_REGEX.test(usuarioId)) {
    throw new NoEncontrado('Notificación no encontrada o no pertenece al usuario', 'NOT_FOUND');
  }

  const { rows } = await db.query(
    'UPDATE notificaciones SET leido = true WHERE id = $1 AND usuario_id = $2 RETURNING id',
    [id, usuarioId]
  );

  if (!rows || rows.length === 0) {
    throw new NoEncontrado('Notificación no encontrada o no pertenece al usuario', 'NOT_FOUND');
  }

  return rows[0];
}

/**
 * Marca todas las notificaciones pendientes del usuario como leídas.
 * @param {string} usuarioId - UUID del usuario autenticado
 * @returns {Promise<Array<{ id: string }>>} Filas actualizadas
 */
async function marcarTodasLeidas(usuarioId) {
  if (!usuarioId || !UUID_REGEX.test(usuarioId)) {
    return [];
  }

  const { rows } = await db.query(
    'UPDATE notificaciones SET leido = true WHERE usuario_id = $1 AND NOT leido RETURNING id',
    [usuarioId]
  );

  return rows;
}

/**
 * Ejecuta la consulta de reintento del Job HIS-E-09 para crear notificaciones
 * de resultados diagnósticos emitidos en las últimas 24 horas que no se hayan notificado.
 * @returns {Promise<Array<{ id: string }>>} Filas insertadas
 */
async function reintentarNotificacionesPendientes() {
  const sql = `
    INSERT INTO notificaciones (usuario_id, resultado_id, mensaje)
    SELECT a.medico_id, r.id, 'Resultado de '||lower(r.tipo)||' disponible · orden '||o.codigo
    FROM resultados_diagnosticos r
    JOIN ordenes_diagnosticas o ON o.id=r.orden_id
    JOIN atenciones a ON a.id=o.atencion_id
    WHERE r.fecha_creacion > now()-interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM notificaciones n WHERE n.resultado_id=r.id)
    RETURNING id;
  `;

  const { rows } = await db.query(sql);
  return rows;
}

module.exports = {
  conteoNoLeidas,
  listarNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  reintentarNotificacionesPendientes
};
