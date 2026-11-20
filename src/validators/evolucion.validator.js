// src/validators/evolucion.validator.js — validaciones de entrada para evolución SOAP (C.6)
const { body, validationResult } = require('express-validator');

/**
 * Reglas de validación para la firma de una evolución médica SOAP.
 * - Subjetivo (S): obligatorio.
 * - Análisis (A): obligatorio.
 * - Objetivo (O): opcional.
 * - Plan (P): opcional.
 */
const firmarEvolucionRules = [
  body('subjetivo')
    .trim()
    .notEmpty()
    .withMessage('El campo Subjetivo es obligatorio para firmar'),
  body('analisis')
    .trim()
    .notEmpty()
    .withMessage('El campo Análisis es obligatorio para firmar'),
  body('objetivo')
    .optional({ values: 'null' })
    .trim(),
  body('plan')
    .optional({ values: 'null' })
    .trim(),
];

/**
 * Middleware que evalúa las reglas de express-validator y devuelve HTTP 422
 * estructurado si existen errores.
 */
function validar(rules) {
  return [
    ...rules,
    (req, res, next) => {
      const errors = validationResult(req);
      if (errors.isEmpty()) {
        return next();
      }

      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'VALIDACION_FALLIDA',
          mensaje: 'Faltan campos requeridos para la evolución SOAP',
          campos: errors.array().map((e) => ({
            campo: e.path || e.param,
            mensaje: e.msg,
          })),
        },
      });
    },
  ];
}

module.exports = {
  firmarEvolucionRules,
  validar,
};
