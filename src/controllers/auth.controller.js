// src/controllers/auth.controller.js — controlador para autenticación y control de acceso
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const authService = require('../services/auth.service');
const { generarTokenCsrf } = require('../middlewares/csrf');

const esPeticionApi = (req) =>
  req.originalUrl.startsWith('/api/') ||
  req.xhr ||
  (req.headers.accept && req.headers.accept.includes('application/json')) ||
  (req.headers['content-type'] && req.headers['content-type'].includes('application/json'));

const obtenerIp = (req) => (req.ip || '').replace('::ffff:', '');

// Valida que la ruta de redirección sea segura y relativa (evita open-redirect)
const siguienteSegura = (n) => {
  if (typeof n !== 'string') return null;
  const valor = n.trim();
  if (!valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/\\')) return null;
  if (/[\x00-\x1f\x7f\\]/.test(valor)) return null;
  return valor;
};

/**
 * Renderiza el formulario de inicio de sesión o redirige si ya hay sesión.
 */
function renderLogin(req, res) {
  if (req.session && req.session.usuario) {
    if (req.session.usuario.debe_cambiar_clave) {
      return res.redirect('/auth/cambiar-clave');
    }
    return res.redirect('/dashboard');
  }
  const token = res.locals.csrfToken || generarTokenCsrf(req);
  res.locals.csrfToken = token;
  return res.render('auth/login', {
    error: null,
    next: req.query.next || '',
    expirada: false,
    csrfToken: token,
  });
}

/**
 * Renderiza la pantalla de sesión expirada avisando sobre la expiración de la sesión (C.27).
 * Pasa { error: null, next, expirada: true, borrador, csrfToken }.
 */
function renderSesionExpirada(req, res) {
  let borrador = req.session && req.session.borrador ? req.session.borrador : null;

  if (!borrador && req.query.borrador) {
    try {
      borrador = JSON.parse(req.query.borrador);
    } catch {
      borrador = req.query.borrador;
    }
  }

  const token = res.locals.csrfToken || generarTokenCsrf(req);
  res.locals.csrfToken = token;

  const datos = {
    error: null,
    next: req.query.next || '',
    expirada: true,
    borrador: borrador || null,
    csrfToken: token,
  };

  const vistaExpirada = path.join(__dirname, '..', 'views', 'auth', 'sesion_expirada.ejs');
  if (fs.existsSync(vistaExpirada)) {
    return res.render('auth/sesion_expirada', datos);
  }
  return res.render('auth/login', datos);
}

/**
 * Procesa el inicio de sesión con credenciales, regeneración de sesión y auditoría.
 */
async function login(req, res, next) {
  try {
    const { email = '', password = '', next: nextUrl = '' } = req.body;
    const ip = obtenerIp(req);
    const siguiente = siguienteSegura(nextUrl || req.query.next);

    const usuario = await authService.autenticar(email, password, ip);

    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.usuario = {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        debe_cambiar_clave: usuario.debe_cambiar_clave,
      };

      const secret = process.env.SESSION_SECRET || 'cambiar-en-.env';
      req.session.csrfToken = crypto
        .createHmac('sha256', secret)
        .update('auth:' + String(usuario.id) + ':' + String(req.sessionID || ''))
        .digest('hex');

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);

        const destino = usuario.debe_cambiar_clave
          ? '/auth/cambiar-clave'
          : (siguiente || '/dashboard');

        if (esPeticionApi(req)) {
          return res.json({
            ok: true,
            data: {
              usuario: req.session.usuario,
              redirect: destino,
            },
          });
        }

        return res.redirect(destino);
      });
    });
  } catch (err) {
    if (err.status === 401) {
      if (esPeticionApi(req)) {
        return res.status(401).json({
          ok: false,
          error: {
            codigo: 'CREDENCIALES_INVALIDAS',
            mensaje: err.message,
          },
        });
      }
      const esExpirada = Boolean(
        (req.body && (req.body.expirada === 'true' || req.body.expirada === true)) ||
        (req.query && (req.query.expirada === 'true' || req.query.expirada === true))
      );
      const token = res.locals.csrfToken || generarTokenCsrf(req);
      res.locals.csrfToken = token;

      if (esExpirada) {
        const vistaExpirada = path.join(__dirname, '..', 'views', 'auth', 'sesion_expirada.ejs');
        if (fs.existsSync(vistaExpirada)) {
          return res.status(401).render('auth/sesion_expirada', {
            error: err.message,
            next: (req.body && req.body.next) || (req.query && req.query.next) || '',
            expirada: true,
            borrador: null,
            csrfToken: token,
          });
        }
      }

      return res.status(401).render('auth/login', {
        error: err.message,
        next: (req.body && req.body.next) || (req.query && req.query.next) || '',
        expirada: esExpirada,
        csrfToken: token,
      });
    }
    return next(err);
  }
}

/**
 * Cierra la sesión activa del usuario, audita y destruye la cookie.
 */
async function logout(req, res, next) {
  try {
    const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
    const ip = obtenerIp(req);

    await authService.cerrarSesion(usuarioId, ip);

    req.session.destroy((err) => {
      if (err) return next(err);

      res.clearCookie('hiscare.sid');

      if (esPeticionApi(req)) {
        return res.json({
          ok: true,
          mensaje: 'Sesión cerrada correctamente',
        });
      }

      return res.redirect('/auth/login');
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Renderiza la pantalla informativa de soporte para restablecimiento de contraseña vía Sistemas.
 */
function renderRecuperar(req, res) {
  return res.render('auth/recuperar');
}

/**
 * Renderiza la vista de cambio de contraseña.
 */
function renderCambiarClave(req, res) {
  const token = res.locals.csrfToken || generarTokenCsrf(req);
  res.locals.csrfToken = token;
  return res.render('auth/cambiar-clave', {
    error: null,
    mensaje: null,
    csrfToken: token,
  });
}

/**
 * Procesa el cambio de contraseña del usuario autenticado.
 */
async function cambiarClave(req, res, next) {
  try {
    const { passwordActual = '', passwordNueva = '' } = req.body;
    const usuarioId = req.session.usuario.id;
    const ip = obtenerIp(req);

    await authService.cambiarClave(usuarioId, passwordActual, passwordNueva, ip);

    req.session.usuario.debe_cambiar_clave = false;

    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);

      if (esPeticionApi(req)) {
        return res.json({
          ok: true,
          mensaje: 'Contraseña actualizada exitosamente',
        });
      }

      return res.redirect('/dashboard');
    });
  } catch (err) {
    const status = err.status || 400;
    if (esPeticionApi(req)) {
      return res.status(status).json({
        ok: false,
        error: {
          codigo: err.codigo || 'ERROR_CAMBIO_CLAVE',
          mensaje: err.message,
        },
      });
    }

    const token = res.locals.csrfToken || generarTokenCsrf(req);
    res.locals.csrfToken = token;

    return res.status(status).render('auth/cambiar-clave', {
      error: err.message,
      mensaje: null,
      csrfToken: token,
    });
  }
}

module.exports = {
  renderLogin,
  renderSesionExpirada,
  login,
  logout,
  renderRecuperar,
  renderCambiarClave,
  cambiarClave,
};
