// src/validators/orden.validator.js — validación de entrada para órdenes diagnósticas (C.7)
const { body, validationResult } = require('express-validator');

/**
 * Reglas de validación para la creación de una orden diagnóstica:
 * - tipo: Obligatorio, debe ser 'LABORATORIO' o 'RADIOLOGIA'.
 * - items: Array no vacío de procedimientos.
 * - items.*.cups_id: UUID válido obligatorio.
 * - items.*.cantidad: Entero entre 1 y 99 (opcional, default 1).
 */
const ordenRules = [
  body('tipo')
    .trim()
    .isIn(['LABORATORIO', 'RADIOLOGIA'])
    .withMessage('El tipo de orden debe ser LABORATORIO o RADIOLOGIA'),

  body('items')
    .isArray({ min: 1 })
    .withMessage('Debe incluir al menos un procedimiento CUPS'),

  body('items.*.cups_id')
    .trim()
    .isUUID()
    .withMessage('Cada ítem debe contener un cups_id válido'),

  body('items.*.cantidad')
    .optional({ checkFalsy: false })
    .isInt({ min: 1, max: 99 })
    .withMessage('La cantidad debe ser un número entero entre 1 y 99'),
];

/**
 * Middleware que evalúa las reglas de express-validator y devuelve HTTP 422
 * estructurado con el desglose de campos erróneos si la validación falla.
 * 
 * @param {Array} reglas Reglas de validación de express-validator
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
  ordenRules,
  validar,
};
