// src/middlewares/locals.js — inyecta usuario, menú RBAC y módulo activo en res.locals
const { menuPorRol } = require('../config/permisos');
const { generarTokenCsrf } = require('./csrf');

function locals(req, res, next) {
  const u = (req.session && req.session.usuario) || null;
  res.locals.usuario = u;
  res.locals.menu = u ? menuPorRol(u.rol) : [];
  res.locals.rutaActual = req.path;
  res.locals.csrfToken = generarTokenCsrf(req);

  // Determinar el módulo activo para que el sidebar sepa cuál resaltar
  let moduloActivo = '';
  if (req.path === '/' || req.path === '/inicio' || req.path.startsWith('/inicio/')) {
    moduloActivo = 'inicio';
  } else if (req.path === '/dashboard' || req.path.startsWith('/dashboard/')) {
    moduloActivo = 'dashboard';
  } else if (res.locals.menu && res.locals.menu.length > 0) {
    const match = res.locals.menu.find(
      (m) => m.ruta !== '/' && m.ruta !== '/inicio' && req.path.startsWith(m.ruta)
    );
    if (match) {
      moduloActivo = match.clave;
    } else {
      const seg = req.path.split('/')[1];
      const matchClave = res.locals.menu.find((m) => m.clave === seg);
      moduloActivo = matchClave ? matchClave.clave : (seg || 'inicio');
    }
  } else {
    moduloActivo = req.path.split('/')[1] || 'inicio';
  }
  res.locals.moduloActivo = moduloActivo;

  next();
}

module.exports = locals;
