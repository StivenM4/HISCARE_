// src/validators/adenda.validator.js — Validaciones para adendas inmutables (C.22)
const { body, validationResult } = require('express-validator');

/**
 * Reglas de validación para el registro de una adenda clínica.
 * - texto: obligatorio, trim, longitud mínima 10 y máxima 2000 caracteres.
 */
const adendaRules = [
  body('texto')
    .trim()
    .notEmpty()
    .withMessage('El texto de la adenda es obligatorio')
    .isLength({ min: 10, max: 2000 })
    .withMessage('El texto de la adenda debe tener entre 10 y 2000 caracteres'),
];

/**
 * Middleware que evalúa las reglas de express-validator y devuelve HTTP 422 estructurado si falla.
 */
function validar(reglas) {
  return [
    ...reglas,
    (req, res, next) => {
      const errors = validationResult(req);
      if (errors.isEmpty()) {
        return next();
      }

      const listaErrores = errors.array();
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
  adendaRules,
  validar,
  validarAdenda: validar(adendaRules),
};
