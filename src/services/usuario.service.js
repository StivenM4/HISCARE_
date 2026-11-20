// src/services/usuario.service.js — lógica de negocio para usuarios y roles (Pantalla C.12)
const bcryptjs = require('bcryptjs');
const db = require('../db');
const { modulos, ROLES } = require('../config/permisos');

/**
 * Listar usuarios con filtros por término (nombre o correo), rol y estado (activo/inactivo), paginado.
 */
async function listar({ q, rol, activo, page = 1, limite = 20 } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, parseInt(limite, 10) || 20);
  const offset = (p - 1) * l;

  const condiciones = [];
  const params = [];

  if (q && typeof q === 'string' && q.trim()) {
    params.push(`%${q.trim()}%`);
    condiciones.push(`(u.nombre ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }

  if (rol && typeof rol === 'string' && rol.trim() && rol.trim() !== 'todos') {
    params.push(rol.trim());
    condiciones.push(`(r.nombre = $${params.length} OR r.id::text = $${params.length})`);
  }

  if (activo !== undefined && activo !== null && activo !== '' && activo !== 'todos') {
    const esActivo = activo === true || activo === 'true';
    params.push(esActivo);
    condiciones.push(`u.activo = $${params.length}`);
  }

  const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  // 1. Conteo total de usuarios filtrados
  const countSql = `
    SELECT count(DISTINCT u.id)::int AS total
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    ${whereClause}
  `;
  const countRes = await db.query(countSql, params);
  const total = countRes.rows[0] ? countRes.rows[0].total : 0;

  // 2. Consulta de filas paginadas con especialidades agrupadas
  const queryParams = [...params, l, offset];
  const listSql = `
    SELECT u.id, u.nombre, u.email, r.nombre AS rol, r.id AS rol_id, u.activo, u.debe_cambiar_clave,
           COALESCE(string_agg(e.nombre, ', ' ORDER BY e.nombre), '') AS especialidades
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    LEFT JOIN usuario_especialidad ue ON ue.usuario_id = u.id
    LEFT JOIN especialidades e ON e.id = ue.especialidad_id
    ${whereClause}
    GROUP BY u.id, r.nombre, r.id
    ORDER BY u.nombre
    LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
  `;
  const listRes = await db.query(listSql, queryParams);

  return {
    filas: listRes.rows,
    total,
    page: p,
    paginas: Math.ceil(total / l) || 1,
  };
}

/**
 * Obtener todos los roles institucionales disponibles.
 */
async function obtenerRoles() {
  const { rows } = await db.query('SELECT id, nombre FROM roles ORDER BY nombre');
  return rows;
}

/**
 * Crear un nuevo usuario en base de datos de manera transaccional.
 */
async function crear({ nombre, email, rol_id, password_temporal }, ctx) {
  const hash = await bcryptjs.hash(password_temporal, 12);
  const emailNorm = email.toLowerCase().trim();
  const nombreNorm = nombre.trim();

  try {
    return await db.tx(ctx, async (client) => {
      const sql = `
        INSERT INTO usuarios (nombre, email, password_hash, rol_id, debe_cambiar_clave, activo)
        VALUES ($1, $2, $3, $4, true, true)
        RETURNING id, nombre, email, rol_id, activo, debe_cambiar_clave
      `;
      const res = await client.query(sql, [nombreNorm, emailNorm, hash, rol_id]);
      return res.rows[0];
    });
  } catch (err) {
    if (err.code === '23505') {
      const errorDuplicado = new Error('El correo electrónico ya se encuentra registrado');
      errorDuplicado.codigo = 'CORREO_DUPLICADO';
      errorDuplicado.status = 409;
      throw errorDuplicado;
    }
    throw err;
  }
}

/**
 * Actualizar los datos de un usuario (nombre, correo, rol y opcionalmente su clave temporal).
 */
async function actualizar(id, { nombre, email, rol_id, password_temporal }, usuarioSesion, ctx) {
  const emailNorm = email.toLowerCase().trim();
  const nombreNorm = nombre.trim();

  try {
    return await db.tx(ctx, async (client) => {
      // Validar si el usuario en sesión es el mismo que se intenta actualizar
      if (usuarioSesion && usuarioSesion.id === id) {
        const { rows: actual } = await client.query('SELECT rol_id FROM usuarios WHERE id = $1', [id]);
        if (actual.length === 0) {
          const errNotFound = new Error('Usuario no encontrado');
          errNotFound.codigo = 'USUARIO_NO_ENCONTRADO';
          errNotFound.status = 404;
          throw errNotFound;
        }
        if (actual[0].rol_id !== rol_id) {
          const errCambio = new Error('El administrador no puede cambiar su propio rol');
          errCambio.codigo = 'AUTO_CAMBIO_ROL_NO_PERMITIDO';
          errCambio.status = 422;
          throw errCambio;
        }
      }

      let res;
      if (password_temporal && typeof password_temporal === 'string' && password_temporal.trim()) {
        const hash = await bcryptjs.hash(password_temporal, 12);
        const sql = `
          UPDATE usuarios
          SET nombre = $1, email = $2, rol_id = $3, password_hash = $4, debe_cambiar_clave = true, fecha_modificacion = now()
          WHERE id = $5
          RETURNING id, nombre, email, rol_id, activo, debe_cambiar_clave
        `;
        res = await client.query(sql, [nombreNorm, emailNorm, rol_id, hash, id]);
      } else {
        const sql = `
          UPDATE usuarios
          SET nombre = $1, email = $2, rol_id = $3, fecha_modificacion = now()
          WHERE id = $4
          RETURNING id, nombre, email, rol_id, activo, debe_cambiar_clave
        `;
        res = await client.query(sql, [nombreNorm, emailNorm, rol_id, id]);
      }

      if (res.rowCount === 0) {
        const errNotFound = new Error('Usuario no encontrado');
        errNotFound.codigo = 'USUARIO_NO_ENCONTRADO';
        errNotFound.status = 404;
        throw errNotFound;
      }

      return res.rows[0];
    });
  } catch (err) {
    if (err.code === '23505') {
      const errorDuplicado = new Error('El correo electrónico ya se encuentra registrado');
      errorDuplicado.codigo = 'CORREO_DUPLICADO';
      errorDuplicado.status = 409;
      throw errorDuplicado;
    }
    throw err;
  }
}

/**
 * Cambiar el estado activo/inactivo de un usuario.
 * Si se desactiva, se revocan todas sus sesiones activas de connect-pg-simple en infra.session.
 */
async function cambiarEstado(id, activo, usuarioSesion, ctx) {
  if (usuarioSesion && usuarioSesion.id === id && activo === false) {
    const errorDesactivacion = new Error('El administrador no puede desactivarse a sí mismo');
    errorDesactivacion.codigo = 'AUTO_DESACTIVACION_NO_PERMITIDA';
    errorDesactivacion.status = 422;
    throw errorDesactivacion;
  }

  return await db.tx(ctx, async (client) => {
    const res = await client.query(
      'UPDATE usuarios SET activo = $1, fecha_modificacion = now() WHERE id = $2 RETURNING id, activo',
      [activo, id]
    );

    if (res.rowCount === 0) {
      const errNotFound = new Error('Usuario no encontrado');
      errNotFound.codigo = 'USUARIO_NO_ENCONTRADO';
      errNotFound.status = 404;
      throw errNotFound;
    }

    if (!activo) {
      // Cerrar sesiones activas en infra.session para el usuario revocado
      await client.query("DELETE FROM infra.session WHERE sess->'usuario'->>'id' = $1", [id]);
    }

    return res.rows[0];
  });
}

/**
 * Obtener la matriz de permisos para inspección visual y consumo API.
 */
function obtenerMatrizPermisos() {
  return {
    modulos,
    roles: ROLES,
  };
}

module.exports = {
  listar,
  obtenerRoles,
  crear,
  actualizar,
  cambiarEstado,
  obtenerMatrizPermisos,
};
