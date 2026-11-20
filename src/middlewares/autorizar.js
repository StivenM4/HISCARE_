// src/middlewares/autorizar.js — control de acceso basado en roles (RBAC) y auditoría (C.12, C.27, HIS-NF-10, HIS-D-04)
const { puede, inicioPorRol } = require('../config/permisos');
const db = require('../db');

const esApi = (req) =>
  Boolean(
    (req.originalUrl && req.originalUrl.startsWith('/api/')) ||
    req.xhr ||
    (req.path && req.path.startsWith('/api/'))
  );

/**
 * Middleware de autorización RBAC (Pantalla C.12, C.27 - HIS-F-01, HIS-NF-10, HIS-D-04).
 * Verifica si el rol del usuario posee permiso (L o E) sobre el módulo especificado.
 * Si no lo posee:
 * - Audita evento ACCESO_DENEGADO con { ruta, metodo, rol }.
 * - Petición API: responde HTTP 403 JSON { ok: false, error: { codigo: 'ACCESO_DENEGADO', mensaje: 'No tiene permiso' } }.
 * - Petición de navegador: renderiza errores/403 con HTTP 403 y variables de contexto.
 */
const autorizar = (modulo, accion) => async (req, res, next) => {
  const rol = req.session && req.session.usuario ? req.session.usuario.rol : null;

  if (rol && puede(rol, modulo, accion)) {
    return next();
  }

  try {
    await db.tx(db.ctxDe(req), (client) =>
      client.query("SELECT fn_auditar_evento('ACCESO_DENEGADO', $1, NULL, $2)", [
        modulo,
        JSON.stringify({ ruta: req.originalUrl, metodo: req.method, rol: rol || null }),
      ])
    );
  } catch (err) {
    return next(err);
  }

  if (esApi(req)) {
    return res.status(403).json({
      ok: false,
      error: { codigo: 'ACCESO_DENEGADO', mensaje: 'No tiene permiso' },
    });
  }

  return res.status(403).render('errores/403', {
    ruta: req.originalUrl,
    metodo: req.method,
    rol: rol || 'Sin rol',
    modulo,
    fecha: new Date().toLocaleString('es-CO'),
    inicioUrl: (rol && inicioPorRol[rol]) || '/',
  });
};

module.exports = { autorizar };

