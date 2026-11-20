// src/middlewares/csrf.js — Protección CSRF, verificación de Origin y tokens anti-falsificación
const crypto = require('crypto');

const esPeticionApi = (req) =>
  req.originalUrl.startsWith('/api/') ||
  req.xhr ||
  (req.headers.accept && req.headers.accept.includes('application/json')) ||
  (req.headers['content-type'] && req.headers['content-type'].includes('application/json'));

/**
 * Comparación segura de tokens en tiempo constante.
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      return true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

/**
 * Genera o recupera el token CSRF para la sesión actual.
 * - Si hay sesión con token explícito req.session.csrfToken, lo retorna.
 * - Si hay sesión con usuario autenticado, genera token determinista vinculado a la sesión.
 * - Si es sesión anónima (login, sesión expirada), genera token determinista
 *   basado en 'anon' para evitar desincronizaciones por sessionIDs efímeros no persistidos.
 */
function generarTokenCsrf(req) {
  if (!req) return '';
  const secret = process.env.SESSION_SECRET || 'cambiar-en-.env';

  if (req.session) {
    if (req.session.csrfToken) {
      return req.session.csrfToken;
    }
    if (req.session.usuario) {
      return crypto
        .createHmac('sha256', secret)
        .update('auth:' + String(req.session.usuario.id) + ':' + String(req.sessionID || ''))
        .digest('hex');
    }
  }

  return crypto.createHmac('sha256', secret).update('anon').digest('hex');
}

/**
 * Middleware para verificar la validez de peticiones mutantes contra ataques CSRF.
 */
function verificarCsrf(req, res, next) {
  const metodo = (req.method || '').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
    return next();
  }

  // 1. Verificación de encabezado Origin / Referer (Cross-Origin Request Forgery)
  const origin = req.get('origin');
  const host = req.get('host');

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        if (esPeticionApi(req)) {
          return res.status(403).json({
            ok: false,
            error: {
              codigo: 'CSRF_ORIGEN_INVALIDO',
              mensaje: 'Solicitud bloqueada por política de protección CSRF (origen cruzado no autorizado).',
            },
          });
        }
        return res.status(403).render('errores/403', {
          titulo: 'Acceso denegado (CSRF)',
          rol: (req.session && req.session.usuario && req.session.usuario.rol) || null,
          inicioRuta: '/',
          inicioUrl: '/',
          ruta: req.originalUrl || req.path || '',
          metodo,
        });
      }
    } catch (_) {
      if (esPeticionApi(req)) {
        return res.status(403).json({
          ok: false,
          error: {
            codigo: 'CSRF_ORIGEN_INVALIDO',
            mensaje: 'Solicitud bloqueada por política de protección CSRF (origen cruzado no autorizado).',
          },
        });
      }
      return res.status(403).render('errores/403', {
        titulo: 'Acceso denegado (CSRF)',
        rol: (req.session && req.session.usuario && req.session.usuario.rol) || null,
        inicioRuta: '/',
        inicioUrl: '/',
        ruta: req.originalUrl || req.path || '',
        metodo,
      });
    }
  }

  // 2. Verificación de Token CSRF explícito si fue provisto
  const tokenEnviado = req.get('x-csrf-token') || (req.body && req.body._csrf);
  if (tokenEnviado) {
    const secret = process.env.SESSION_SECRET || 'cambiar-en-.env';
    const tokenEsperado = generarTokenCsrf(req);
    const tokenAnon = crypto.createHmac('sha256', secret).update('anon').digest('hex');

    let coincide = safeCompare(tokenEnviado, tokenEsperado);

    // En rutas públicas de autenticación (/auth/login),
    // aceptar tanto el token actual como el token anónimo
    const url = req.originalUrl || req.path || '';
    const esRutaPublicaAuth =
      url.startsWith('/auth/login') ||
      req.path === '/login';

    if (!coincide && esRutaPublicaAuth) {
      coincide = safeCompare(tokenEnviado, tokenAnon);
    }

    if (!coincide) {
      if (esPeticionApi(req)) {
        return res.status(403).json({
          ok: false,
          error: {
            codigo: 'CSRF_TOKEN_INVALIDO',
            mensaje: 'Token de seguridad CSRF inválido o expirado.',
          },
        });
      }
      return res.status(403).render('errores/403', {
        titulo: 'Acceso denegado (CSRF)',
        rol: (req.session && req.session.usuario && req.session.usuario.rol) || null,
        inicioRuta: '/',
        inicioUrl: '/',
        ruta: req.originalUrl || req.path || '',
        metodo,
      });
    }
  }

  return next();
}

module.exports = {
  generarTokenCsrf,
  verificarCsrf,
};
