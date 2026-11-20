// src/services/auth.service.js — lógica de negocio para autenticación y cambio de contraseña
const bcrypt = require('bcryptjs');
const db = require('../db');

/**
 * Autentica un usuario con email y contraseña.
 * Registra eventos en la bitácora de auditoría mediante fn_auditar_evento.
 *
 * @param {string} email
 * @param {string} password
 * @param {string} ip
 * @returns {Promise<{id: string, nombre: string, email: string, rol: string, debe_cambiar_clave: boolean}>}
 */
async function autenticar(email, password, ip) {
  const { rows: [u] } = await db.query(
    `SELECT u.id, u.nombre, u.email, u.password_hash, u.activo, u.debe_cambiar_clave, r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
      WHERE lower(u.email) = lower($1)`,
    [email]
  );

  const contrasenaValida = u ? await bcrypt.compare(password, u.password_hash) : false;
  const esValido = Boolean(u && u.activo && contrasenaValida);

  if (!esValido) {
    // Transacción sin usuario autenticado pero con IP de origen
    await db.tx({ usuarioId: '', ip }, async (c) => {
      await c.query(
        "SELECT fn_auditar_evento('LOGIN_FALLIDO', 'usuarios', $1, $2)",
        [u ? u.id : null, JSON.stringify({ email })]
      );
    });

    // Error genérico 401: jamás revelar si el correo existe o si la clave falló
    const error = new Error('Credenciales inválidas. Verifique su correo y contraseña');
    error.status = 401;
    error.codigo = 'CREDENCIALES_INVALIDAS';
    throw error;
  }

  // Transacción con usuario autenticado e IP
  await db.tx({ usuarioId: u.id, ip }, async (c) => {
    await c.query(
      "SELECT fn_auditar_evento('LOGIN', 'usuarios', $1, NULL)",
      [u.id]
    );
  });

  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    debe_cambiar_clave: u.debe_cambiar_clave,
  };
}

/**
 * Cierra la sesión activa registrando el evento de auditoría LOGOUT.
 *
 * @param {string} usuarioId
 * @param {string} ip
 */
async function cerrarSesion(usuarioId, ip) {
  if (usuarioId) {
    await db.tx({ usuarioId, ip }, async (c) => {
      await c.query(
        "SELECT fn_auditar_evento('LOGOUT', 'usuarios', $1, NULL)",
        [usuarioId]
      );
    });
  }
}

/**
 * Cambia la contraseña del usuario tras validar la contraseña actual.
 *
 * @param {string} usuarioId
 * @param {string} passwordActual
 * @param {string} passwordNueva
 * @param {string} ip
 * @returns {Promise<{ok: boolean}>}
 */
async function cambiarClave(usuarioId, passwordActual, passwordNueva, ip) {
  const { rows: [u] } = await db.query(
    'SELECT id, password_hash FROM usuarios WHERE id = $1',
    [usuarioId]
  );

  if (!u) {
    const err = new Error('Usuario no encontrado');
    err.status = 404;
    err.codigo = 'USUARIO_NO_ENCONTRADO';
    throw err;
  }

  const coincide = await bcrypt.compare(passwordActual, u.password_hash);
  if (!coincide) {
    const err = new Error('La contraseña actual es incorrecta');
    err.status = 400;
    err.codigo = 'PASSWORD_ACTUAL_INCORRECTA';
    throw err;
  }

  const nuevoHash = await bcrypt.hash(passwordNueva, 12);

  await db.tx({ usuarioId, ip }, async (c) => {
    await c.query(
      `UPDATE usuarios
          SET password_hash = $1,
              debe_cambiar_clave = false,
              fecha_modificacion = now()
        WHERE id = $2`,
      [nuevoHash, usuarioId]
    );
  });

  return { ok: true };
}

module.exports = {
  autenticar,
  cerrarSesion,
  cambiarClave,
};
