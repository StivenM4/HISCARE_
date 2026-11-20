// src/middlewares/sesion.js — exigencia de sesión activa (Pantalla C.27, HIS-NF-06, HIS-NF-10)

const esApi = (req) =>
  Boolean(
    (req.originalUrl && req.originalUrl.startsWith('/api/')) ||
    req.xhr ||
    (req.path && req.path.startsWith('/api/'))
  );

/**
 * Middleware de exigencia de sesión activa.
 * - Si existe req.session.usuario: continúa con next().
 * - Si falta sesión o expiró:
 *   * Petición API (originalUrl o path con /api/ o req.xhr): HTTP 401 con código SESION_EXPIRADA.
 *   * Petición de navegador: HTTP 302 Redirección a /auth/sesion-expirada?next=<ruta original>.
 */
function sesion(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  }

  if (esApi(req)) {
    return res.status(401).json({
      ok: false,
      error: {
        codigo: 'SESION_EXPIRADA',
        mensaje: 'Su sesión expiró',
      },
    });
  }

  const destino = req.originalUrl || req.url || '/';
  return res.redirect('/auth/sesion-expirada?next=' + encodeURIComponent(destino));
}

module.exports = { sesion };
