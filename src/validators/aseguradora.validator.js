// src/validators/aseguradora.validator.js — validaciones para Pantalla C.14 (Catálogo de EPS y aseguradoras)
const { body, param, validationResult } = require('express-validator');

const TIPOS_PLAN_VALIDOS = ['Contributivo', 'Subsidiado', 'Especial', 'Particular'];

// Reglas para creación de aseguradora: POST /api/aseguradoras
const aseguradoraCrearRules = [
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre de la aseguradora es obligatorio')
    .isLength({ min: 3, max: 150 }).withMessage('El nombre debe tener entre 3 y 150 caracteres'),

  body('tipo_plan')
    .trim()
    .notEmpty().withMessage('El tipo de plan es obligatorio')
    .isIn(TIPOS_PLAN_VALIDOS).withMessage('Tipo de plan inválido. Debe ser Contributivo, Subsidiado, Especial o Particular'),

  body('activo')
    .optional()
    .isBoolean().withMessage('El campo activo debe ser booleano'),
];

// Reglas para edición de aseguradora: PUT /api/aseguradoras/:id
const aseguradoraEditarRules = [
  param('id')
    .isUUID().withMessage('Identificador UUID inválido'),

  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre de la aseguradora es obligatorio')
    .isLength({ min: 3, max: 150 }).withMessage('El nombre debe tener entre 3 y 150 caracteres'),

  body('tipo_plan')
    .trim()
    .notEmpty().withMessage('El tipo de plan es obligatorio')
    .isIn(TIPOS_PLAN_VALIDOS).withMessage('Tipo de plan inválido. Debe ser Contributivo, Subsidiado, Especial o Particular'),

  body('activo')
    .optional()
    .isBoolean().withMessage('El campo activo debe ser booleano'),
];

// Reglas para cambio de estado: PATCH /api/aseguradoras/:id/estado
const aseguradoraEstadoRules = [
  param('id')
    .isUUID().withMessage('Identificador UUID inválido'),

  body('activo')
    .notEmpty().withMessage('El estado activo es obligatorio')
    .isBoolean().withMessage('El campo activo debe ser booleano'),
];

/**
 * Middleware generador de validación express-validator para respuestas JSON con código 422.
 * @param {Array} reglas
 * @returns {Array} middlewares express
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
  TIPOS_PLAN_VALIDOS,
  aseguradoraCrearRules,
  aseguradoraEditarRules,
  aseguradoraEstadoRules,
  validar,
};
