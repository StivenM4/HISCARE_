// src/validators/atencion.validator.js — validaciones de entrada para atención clínica (C.4)
const { body, validationResult } = require('express-validator');

// Reglas para motivo de consulta
const motivoRules = [
  body('motivo_consulta')
    .optional({ nullable: true })
    .isString().withMessage('El motivo de consulta debe ser una cadena de texto'),
];

// Reglas para signos vitales (rangos idénticos al CHECK de la base de datos)
const signosRules = [
  body().custom((val, { req }) => {
    const campos = [
      'presion_sistolica',
      'presion_diastolica',
      'frecuencia_cardiaca',
      'frecuencia_respiratoria',
      'temperatura_celsius',
      'saturacion_oxigeno',
      'peso_kg',
      'talla_cm',
    ];
    const tieneSigno = campos.some((c) => {
      const v = req.body && req.body[c];
      return v !== undefined && v !== null && String(v).trim() !== '';
    });
    if (!tieneSigno) {
      throw new Error('Debe diligenciar al menos un signo vital');
    }
    return true;
  }),

  body('presion_sistolica')
    .optional({ checkFalsy: true })
    .isInt({ min: 40, max: 300 })
    .withMessage('La presión sistólica debe estar entre 40 y 300 mmHg'),

  body('presion_diastolica')
    .optional({ checkFalsy: true })
    .isInt({ min: 20, max: 200 })
    .withMessage('La presión diastólica debe estar entre 20 y 200 mmHg'),

  body('frecuencia_cardiaca')
    .optional({ checkFalsy: true })
    .isInt({ min: 20, max: 300 })
    .withMessage('La frecuencia cardíaca debe estar entre 20 y 300 lpm'),

  body('frecuencia_respiratoria')
    .optional({ checkFalsy: true })
    .isInt({ min: 4, max: 80 })
    .withMessage('La frecuencia respiratoria debe estar entre 4 y 80 rpm'),

  body('temperatura_celsius')
    .optional({ checkFalsy: true })
    .isFloat({ min: 30, max: 45 })
    .withMessage('La temperatura debe estar entre 30 y 45 °C'),

  body('saturacion_oxigeno')
    .optional({ checkFalsy: true })
    .isInt({ min: 0, max: 100 })
    .withMessage('La saturación de oxígeno debe estar entre 0 y 100%'),

  body('peso_kg')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0.3, max: 500 })
    .withMessage('El peso debe estar entre 0.3 y 500 kg'),

  body('talla_cm')
    .optional({ checkFalsy: true })
    .isFloat({ min: 20, max: 260 })
    .withMessage('La talla debe estar entre 20 y 260 cm'),
];

/**
 * Middleware que evalúa las reglas de express-validator y devuelve HTTP 422
 * estructurado si existen errores.
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
  motivoRules,
  signosRules,
  validar,
};
