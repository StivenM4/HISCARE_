// src/validators/antecedente.validator.js — validaciones de entrada para antecedentes clínicos (C.5)
const { body, validationResult } = require('express-validator');

const TIPOS_VALIDOS = [
  'Patologico',
  'Quirurgico',
  'Alergico',
  'Farmacologico',
  'Familiar',
  'Ginecologico',
];

const antecedenteRules = [
  body('tipo')
    .exists({ checkFalsy: true }).withMessage('El tipo de antecedente es requerido')
    .isString().withMessage('El tipo debe ser una cadena de texto')
    .trim()
    .isIn(TIPOS_VALIDOS).withMessage(`El tipo de antecedente debe ser uno de: ${TIPOS_VALIDOS.join(', ')}`),

  body('descripcion')
    .exists({ checkFalsy: true }).withMessage('La descripción del antecedente es requerida')
    .isString().withMessage('La descripción debe ser una cadena de texto')
    .trim()
    .isLength({ min: 3, max: 1000 }).withMessage('La descripción debe tener entre 3 y 1000 caracteres'),
];

/**
 * Middleware que evalúa las reglas de express-validator y devuelve HTTP 422
 * estructurado si existen errores, siguiendo el formato estándar del proyecto.
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
  TIPOS_VALIDOS,
  antecedenteRules,
  validar,
};
