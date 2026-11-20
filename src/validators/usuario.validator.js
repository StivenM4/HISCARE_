// src/validators/usuario.validator.js — validaciones para gestión de usuarios (Pantalla C.12)
const { body, param, validationResult } = require('express-validator');

const DOMINIO_INSTITUCIONAL = (process.env.DOMINIO_CORREO || '@hiscare.edu.co').toLowerCase();

/**
 * Validador personalizado que comprueba si un correo termina en el dominio institucional configurado.
 */
function esDominioInstitucional(value) {
  if (typeof value !== 'string') return false;
  const emailNorm = value.trim().toLowerCase();
  const dominioBuscado = DOMINIO_INSTITUCIONAL.startsWith('@')
    ? DOMINIO_INSTITUCIONAL
    : `@${DOMINIO_INSTITUCIONAL}`;
  return emailNorm.endsWith(dominioBuscado);
}

/**
 * Validador para contraseña temporal (mínimo 10 caracteres, debe contener letras y números).
 */
function esPasswordTemporalValido(value) {
  if (typeof value !== 'string') return false;
  if (value.length < 10) return false;
  return /[a-zA-Z]/.test(value) && /[0-9]/.test(value);
}

// Reglas para creación de usuario: POST /api/usuarios
const usuarioCrearRules = [
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio')
    .isLength({ max: 150 }).withMessage('El nombre no debe superar los 150 caracteres'),

  body('email')
    .trim()
    .notEmpty().withMessage('El correo electrónico es obligatorio')
    .isLength({ max: 150 }).withMessage('El correo no debe superar los 150 caracteres')
    .isEmail().withMessage('El formato de correo electrónico es inválido')
    .custom(esDominioInstitucional)
    .withMessage(`El correo debe pertenecer al dominio institucional (${DOMINIO_INSTITUCIONAL})`),

  body('rol_id')
    .notEmpty().withMessage('El rol es obligatorio')
    .isUUID().withMessage('El rol debe ser un identificador UUID válido'),

  body('password_temporal')
    .notEmpty().withMessage('La contraseña temporal es obligatoria')
    .isLength({ min: 10 }).withMessage('La contraseña temporal debe tener al menos 10 caracteres')
    .custom(esPasswordTemporalValido)
    .withMessage('La contraseña temporal debe contener al menos 10 caracteres e incluir tanto letras como números'),
];

// Reglas para edición de usuario: PUT /api/usuarios/:id
const usuarioEditarRules = [
  param('id')
    .isUUID().withMessage('El identificador de usuario debe ser un UUID válido'),

  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio')
    .isLength({ max: 150 }).withMessage('El nombre no debe superar los 150 caracteres'),

  body('email')
    .trim()
    .notEmpty().withMessage('El correo electrónico es obligatorio')
    .isLength({ max: 150 }).withMessage('El correo no debe superar los 150 caracteres')
    .isEmail().withMessage('El formato de correo electrónico es inválido')
    .custom(esDominioInstitucional)
    .withMessage(`El correo debe pertenecer al dominio institucional (${DOMINIO_INSTITUCIONAL})`),

  body('rol_id')
    .notEmpty().withMessage('El rol es obligatorio')
    .isUUID().withMessage('El rol debe ser un identificador UUID válido'),

  body('password_temporal')
    .optional({ checkFalsy: true })
    .custom(esPasswordTemporalValido)
    .withMessage('La contraseña temporal debe contener al menos 10 caracteres e incluir tanto letras como números'),
];

// Reglas para cambio de estado: PATCH /api/usuarios/:id/estado
const usuarioEstadoRules = [
  param('id')
    .isUUID().withMessage('El identificador de usuario debe ser un UUID válido'),

  body('activo')
    .custom((value) => {
      if (typeof value !== 'boolean') {
        throw new Error('El campo activo debe ser un valor booleano (true o false)');
      }
      return true;
    }),
];

/**
 * Middleware generador de validación express-validator para respuestas JSON con código 422.
 */
function validar(reglas) {
  return [
    ...reglas,
    (req, res, next) => {
      const errores = validationResult(req);
      if (errores.isEmpty()) {
        return next();
      }

      const lista = errores.array();
      const primerError = lista[0].msg;
      const campos = lista.map((e) => ({
        campo: e.path || e.param,
        mensaje: e.msg,
      }));

      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'VALIDACION_FALLIDA',
          mensaje: primerError,
          campos,
        },
      });
    },
  ];
}

module.exports = {
  usuarioCrearRules,
  usuarioEditarRules,
  usuarioEstadoRules,
  validar,
  DOMINIO_INSTITUCIONAL,
  esDominioInstitucional,
  esPasswordTemporalValido,
};
