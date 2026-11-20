// src/validators/consentimiento.validator.js — Validaciones de entrada para consentimientos (C.19)
const { body, validationResult } = require('express-validator');

/**
 * Reglas de validación para la creación de un consentimiento informado.
 * - tipo: obligatorio, texto.
 * - descripcion: obligatorio, texto, al menos 20 caracteres.
 * - fecha: opcional, formato YYYY-MM-DD.
 * - firmado: booleano o valor convertible.
 * - firmado_por: si firmado es true, obligatorio y debe ser 'PACIENTE' o 'ACUDIENTE'.
 */
const consentimientoRules = [
  body('tipo')
    .trim()
    .notEmpty()
    .withMessage('El tipo de consentimiento es obligatorio')
    .isString()
    .withMessage('El tipo de consentimiento debe ser un texto válido'),

  body('descripcion')
    .trim()
    .notEmpty()
    .withMessage('La descripción es obligatoria')
    .isString()
    .withMessage('La descripción debe ser un texto válido')
    .isLength({ min: 20 })
    .withMessage('La descripción debe tener al menos 20 caracteres'),

  body('fecha')
    .optional({ checkFalsy: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('La fecha debe tener formato YYYY-MM-DD'),

  body('firmado')
    .optional()
    .customSanitizer((val) => val === true || val === 'true' || val === 1 || val === '1'),

  body('firmado_por')
    .custom((value, { req }) => {
      const f = req.body && req.body.firmado;
      const esFirmado = f === true || f === 'true' || f === 1 || f === '1';
      if (esFirmado) {
        if (!value || typeof value !== 'string' || !value.trim()) {
          throw new Error('Debe especificar quién firmó el consentimiento (PACIENTE o ACUDIENTE)');
        }
        const valLimpio = value.trim().toUpperCase();
        if (!['PACIENTE', 'ACUDIENTE'].includes(valLimpio)) {
          throw new Error('El firmante debe ser PACIENTE o ACUDIENTE');
        }
      } else if (value && typeof value === 'string' && value.trim()) {
        const valLimpio = value.trim().toUpperCase();
        if (!['PACIENTE', 'ACUDIENTE'].includes(valLimpio)) {
          throw new Error('El firmante debe ser PACIENTE o ACUDIENTE');
        }
      }
      return true;
    }),
];

/**
 * Middleware de validación que evalúa las reglas y responde 422 con el formato
 * estándar de error de validación de HISCARE.
 */
function validar(reglas) {
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
  consentimientoRules,
  validar,
};
