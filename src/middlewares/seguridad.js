// src/middlewares/seguridad.js — sesión, RBAC, rol y variables comunes de las vistas
const { sesion } = require('./sesion');
const { autorizar } = require('./autorizar');
const locals = require('./locals');
const { verificarCsrf, generarTokenCsrf } = require('./csrf');

const soloRol = (...roles) => (req, res, next) => {
  const rol = req.session && req.session.usuario ? req.session.usuario.rol : null;
  if (rol === 'ADMINISTRADOR' || roles.includes(rol)) {
    return next();
  }
  return res.status(403).json({
    ok: false,
    error: { codigo: 'ROL_NO_PERMITIDO', mensaje: 'Acción reservada a ' + roles.join(', ') },
  });
};

module.exports = { sesion, autorizar, soloRol, locals, verificarCsrf, generarTokenCsrf };

