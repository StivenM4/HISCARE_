const { body, validationResult } = require('express-validator');
const { generarTokenCsrf } = require('../middlewares/csrf');

// Reglas para inicio de sesión (C.1)
const reglasLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('El correo institucional es obligatorio')
    .isEmail().withMessage('El formato de correo electrónico es inválido')
    .isLength({ max: 128 }).withMessage('El correo no debe superar los 128 caracteres')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('La contraseña es obligatoria')
    .isLength({ max: 128 }).withMessage('La contraseña no debe superar los 128 caracteres'),
];

// Reglas para cambio obligatorio o voluntario de contraseña
const reglasCambiarClave = [
  body('passwordActual')
    .notEmpty().withMessage('La contraseña actual es obligatoria'),
  body('passwordNueva')
    .notEmpty().withMessage('La nueva contraseña es obligatoria')
    .isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres')
    .isLength({ max: 128 }).withMessage('La nueva contraseña no debe superar los 128 caracteres'),
];

// Determina si una petición espera respuesta JSON / API
function esPeticionApi(req) {
  return (
    req.originalUrl.startsWith('/api/') ||
    req.xhr ||
    (req.headers.accept && req.headers.accept.includes('application/json')) ||
    (req.headers['content-type'] && req.headers['content-type'].includes('application/json'))
  );
}

// Middleware genérico para ejecutar reglas de express-validator y responder
// con 422 JSON o renderizar la vista con el mensaje de error.
function validar(reglas, vistaOpciones = null) {
  return [
    ...reglas,
    (req, res, next) => {
      const errores = validationResult(req);
      if (errores.isEmpty()) {
        return next();
      }

      const listaErrores = errores.array();
      const primerError = listaErrores[0].msg;
      const campos = listaErrores.map((e) => ({
        campo: e.path || e.param,
        mensaje: e.msg,
      }));

      // Si es una petición API / JSON
      if (esPeticionApi(req)) {
        return res.status(422).json({
          ok: false,
          error: {
            codigo: 'VALIDACION_FALLIDA',
            mensaje: primerError,
            campos,
          },
        });
      }

      // Si se definió una vista u opciones específicas
      if (typeof vistaOpciones === 'function') {
        return vistaOpciones(req, res, primerError, campos);
      }

      if (vistaOpciones && typeof vistaOpciones === 'object' && vistaOpciones.vista) {
        return res.status(422).render(vistaOpciones.vista, {
          error: primerError,
          ...vistaOpciones.datos,
        });
      }

      const token = res.locals.csrfToken || generarTokenCsrf(req);
      res.locals.csrfToken = token;

      // Inferencia según la ruta solicitada
      const url = req.originalUrl || req.path || '';
      if (url.includes('cambiar-clave')) {
        return res.status(422).render('auth/cambiar-clave', {
          error: primerError,
          mensaje: null,
          csrfToken: token,
        });
      }

      // Por defecto para formulario de login (HTML)
      const esExpirada = Boolean(
        (req.body && (req.body.expirada === 'true' || req.body.expirada === true)) ||
        (req.query && (req.query.expirada === 'true' || req.query.expirada === true))
      );

      return res.status(422).render('auth/login', {
        error: primerError,
        next: (req.body && req.body.next) || (req.query && req.query.next) || '',
        expirada: esExpirada,
        csrfToken: token,
      });
    },
  ];
}

module.exports = {
  reglasLogin,
  reglasCambiarClave,
  validar,
  esPeticionApi,
};
