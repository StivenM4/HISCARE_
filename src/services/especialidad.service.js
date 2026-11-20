// src/services/especialidad.service.js — servicio de especialidades y asignación N:M (C.13, HIS-F-03, EDT SEG-05)
const db = require('../db');
const { Conflicto, ErrorValidacion, NoEncontrado } = require('../db/errores');

/**
 * Normaliza el nombre de la especialidad (trim y primera letra mayúscula).
 * @param {string} nombre
 * @returns {string}
 */
function normalizarNombre(nombre) {
  const limpio = (nombre || '').trim();
  if (!limpio) {
    throw new ErrorValidacion('El nombre de la especialidad es obligatorio');
  }
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * Retorna todas las especialidades registradas con el conteo de médicos asignados.
 * @returns {Promise<Array<{id: string, nombre: string, medicos: number}>>}
 */
async function listarEspecialidades() {
  const { rows } = await db.query(
    `SELECT e.id, e.nombre, COUNT(ue.usuario_id)::int AS medicos
     FROM especialidades e
     LEFT JOIN usuario_especialidad ue ON e.id = ue.especialidad_id
     GROUP BY e.id, e.nombre
     ORDER BY e.nombre ASC`
  );
  return rows;
}

/**
 * Crea una nueva especialidad médica validando duplicados case-insensitive y restricción UNIQUE.
 * @param {string} nombre
 * @param {object} [ctx]
 * @returns {Promise<{id: string, nombre: string, fecha_creacion: Date, fecha_modificacion: Date}>}
 */
async function crearEspecialidad(nombre, ctx = {}) {
  const nombreNorm = normalizarNombre(nombre);

  // Verificación case-insensitive preventiva
  const { rows: existente } = await db.query(
    'SELECT id, nombre FROM especialidades WHERE LOWER(nombre) = LOWER($1)',
    [nombreNorm]
  );
  if (existente.length > 0) {
    throw new Conflicto(`La especialidad "${nombreNorm}" ya existe en el sistema`);
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO especialidades (nombre)
       VALUES ($1)
       RETURNING id, nombre, fecha_creacion, fecha_modificacion`,
      [nombreNorm]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new Conflicto(`La especialidad "${nombreNorm}" ya existe en el sistema`);
    }
    throw err;
  }
}

/**
 * Actualiza el nombre de una especialidad existente comprobando duplicados en otros registros.
 * @param {string} id
 * @param {string} nombre
 * @param {object} [ctx]
 * @returns {Promise<{id: string, nombre: string, fecha_creacion: Date, fecha_modificacion: Date}>}
 */
async function actualizarEspecialidad(id, nombre, ctx = {}) {
  const nombreNorm = normalizarNombre(nombre);

  const { rows: existenteActual } = await db.query(
    'SELECT id, nombre FROM especialidades WHERE id = $1',
    [id]
  );
  if (existenteActual.length === 0) {
    throw new NoEncontrado('La especialidad especificada no existe');
  }

  const { rows: duplicado } = await db.query(
    'SELECT id, nombre FROM especialidades WHERE LOWER(nombre) = LOWER($1) AND id <> $2',
    [nombreNorm, id]
  );
  if (duplicado.length > 0) {
    throw new Conflicto(`Ya existe otra especialidad con el nombre "${nombreNorm}"`);
  }

  try {
    const { rows } = await db.query(
      `UPDATE especialidades
       SET nombre = $2, fecha_modificacion = now()
       WHERE id = $1
       RETURNING id, nombre, fecha_creacion, fecha_modificacion`,
      [id, nombreNorm]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new Conflicto(`Ya existe otra especialidad con el nombre "${nombreNorm}"`);
    }
    throw err;
  }
}

/**
 * Retorna las especialidades asignadas a un usuario en orden alfabético.
 * @param {string} usuarioId
 * @returns {Promise<Array<{id: string, nombre: string}>>}
 */
async function obtenerEspecialidadesUsuario(usuarioId) {
  const { rows } = await db.query(
    `SELECT e.id, e.nombre
     FROM especialidades e
     JOIN usuario_especialidad ue ON e.id = ue.especialidad_id
     WHERE ue.usuario_id = $1
     ORDER BY e.nombre ASC`,
    [usuarioId]
  );
  return rows;
}

/**
 * Sincroniza atómicamente la asignación N:M de especialidades para un médico en una transacción.
 * Si especialidadIds es vacío, desasigna todas las especialidades.
 * @param {object} ctx
 * @param {string} usuarioId
 * @param {string[]} especialidadIds
 * @returns {Promise<{ok: boolean, usuarioId: string, total: number}>}
 */
async function asignarEspecialidadesUsuario(ctx, usuarioId, especialidadIds = []) {
  // 1. Validar existencia y rol MEDICO
  const { rows: usuarios } = await db.query(
    `SELECT u.id, u.nombre, r.nombre AS rol
     FROM usuarios u
     JOIN roles r ON u.rol_id = r.id
     WHERE u.id = $1`,
    [usuarioId]
  );

  if (usuarios.length === 0) {
    throw new NoEncontrado('El usuario especificado no existe');
  }

  if (usuarios[0].rol !== 'MEDICO') {
    throw new ErrorValidacion('El usuario debe tener rol MEDICO para tener especialidades asignadas');
  }

  // Deduplicar identificadores entrantes
  const idsLimpios = Array.isArray(especialidadIds)
    ? [...new Set(especialidadIds.filter((id) => typeof id === 'string' && id.trim() !== ''))]
    : [];

  // 2. Transacción segura con variables de auditoría
  await db.tx(ctx, async (client) => {
    if (idsLimpios.length === 0) {
      await client.query('DELETE FROM usuario_especialidad WHERE usuario_id = $1', [usuarioId]);
    } else {
      // Elimina especialidades que ya no están asignadas
      await client.query(
        'DELETE FROM usuario_especialidad WHERE usuario_id = $1 AND NOT (especialidad_id = ANY($2::uuid[]))',
        [usuarioId, idsLimpios]
      );

      // Inserta las nuevas especialidades ignorando conflictos existentes
      await client.query(
        `INSERT INTO usuario_especialidad (usuario_id, especialidad_id)
         SELECT $1, unnest($2::uuid[])
         ON CONFLICT (usuario_id, especialidad_id) DO NOTHING`,
        [usuarioId, idsLimpios]
      );
    }
  });

  return { ok: true, usuarioId, total: idsLimpios.length };
}

/**
 * Retorna la lista de profesionales asignados a una especialidad médica.
 * @param {string} especialidadId
 * @returns {Promise<Array<{id: string, nombre: string, rol: string, asignado_desde: Date}>>}
 */
async function obtenerProfesionalesPorEspecialidad(especialidadId) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre, r.nombre AS rol, ue.fecha_creacion AS asignado_desde
     FROM usuarios u
     JOIN roles r ON u.rol_id = r.id
     JOIN usuario_especialidad ue ON u.id = ue.usuario_id
     WHERE ue.especialidad_id = $1
     ORDER BY u.nombre ASC`,
    [especialidadId]
  );
  return rows;
}

/**
 * Retorna todos los profesionales activos con rol MEDICO para selección y asignación.
 * @returns {Promise<Array<{id: string, nombre: string, email: string, rol: string}>>}
 */
async function listarMedicos() {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre, u.email, r.nombre AS rol
     FROM usuarios u
     JOIN roles r ON u.rol_id = r.id
     WHERE r.nombre = 'MEDICO' AND u.activo = true
     ORDER BY u.nombre ASC`
  );
  return rows;
}

module.exports = {
  normalizarNombre,
  listarEspecialidades,
  crearEspecialidad,
  actualizarEspecialidad,
  obtenerEspecialidadesUsuario,
  asignarEspecialidadesUsuario,
  obtenerProfesionalesPorEspecialidad,
  listarMedicos,
};
