// src/validators/nota_alta.validator.js — Validaciones para Nota de alta (epicrisis - C.21)
const { body, validationResult } = require('express-validator');

/**
 * Reglas de validación para la nota de alta (epicrisis).
 * - resumen: trim(), no vacío, mínimo 20 caracteres
 * - recomendaciones: trim(), no vacío, mínimo 20 caracteres
 */
const notaAltaRules = [
  body('resumen')
    .trim()
    .notEmpty()
    .withMessage('El resumen clínico debe tener al menos 20 caracteres')
    .isLength({ min: 20 })
    .withMessage('El resumen clínico debe tener al menos 20 caracteres'),
  body('recomendaciones')
    .trim()
    .notEmpty()
    .withMessage('Las recomendaciones deben tener al menos 20 caracteres')
    .isLength({ min: 20 })
    .withMessage('Las recomendaciones deben tener al menos 20 caracteres'),
];

/**
 * Middleware que evalúa el resultado de express-validator y devuelve HTTP 422 estructurado si falla.
 */
function evaluarErrores(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const campos = errors.array().map((e) => ({
    campo: e.path || e.param,
    mensaje: e.msg,
  }));

  return res.status(422).json({
    ok: false,
    error: {
      codigo: 'VALIDACION_FALLIDA',
      mensaje: 'Datos inválidos',
      campos,
    },
  });
}

/**
 * Middleware de validación completo para la nota de alta.
 */
const validarNotaAlta = [
  ...notaAltaRules,
  evaluarErrores,
];

module.exports = {
  notaAltaRules,
  validarNotaAlta,
  evaluarErrores,
};
