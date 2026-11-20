// src/validators/cita.validator.js — validación de entrada para agendamiento de citas (Pantalla C.16)
const { body, validationResult } = require('express-validator');

/**
 * Reglas de validación para el agendamiento de citas:
 * - paciente_id: UUID obligatorio y válido.
 * - medico_id: UUID obligatorio y válido.
 * - fecha: Formato ISO 8601 (YYYY-MM-DDTHH:mm), no pasada.
 * - duracion_minutos: Entero opcional entre 10 y 120 minutos (default 30).
 */
const citaRules = [
  body('paciente_id')
    .trim()
    .notEmpty().withMessage('El identificador del paciente es obligatorio')
    .isUUID().withMessage('El paciente_id debe ser un UUID válido'),

  body('medico_id')
    .trim()
    .notEmpty().withMessage('El identificador del profesional médico es obligatorio')
    .isUUID().withMessage('El medico_id debe ser un UUID válido'),

  body('fecha')
    .trim()
    .notEmpty().withMessage('La fecha y hora de la cita son obligatorias')
    .matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
    .withMessage('La fecha debe tener formato ISO 8601 (YYYY-MM-DDTHH:mm)')
    .custom((val) => {
      const fechaCita = new Date(val);
      if (isNaN(fechaCita.getTime())) {
        throw new Error('La fecha proporcionada no es válida');
      }
      // Validar que no sea pasada (con tolerancia de 60 segundos por desajustes leves de reloj)
      const ahora = new Date();
      if (fechaCita.getTime() < ahora.getTime() - 60000) {
        throw new Error('La fecha de la cita no puede ser en el pasado');
      }
      return true;
    }),

  body('duracion_minutos')
    .optional({ checkFalsy: true })
    .isInt({ min: 10, max: 120 })
    .withMessage('La duración debe ser un número entero entre 10 y 120 minutos')
    .toInt(),
];

/**
 * Reglas de validación para reprogramación de citas (C.17):
 * - medico_id: UUID obligatorio y válido.
 * - fecha: ISO 8601 (YYYY-MM-DDTHH:mm), no pasada.
 * - motivo: trim, obligatorio, entre 5 y 200 caracteres.
 */
const reprogramarRules = [
  body('medico_id')
    .trim()
    .notEmpty().withMessage('El identificador del profesional médico es obligatorio')
    .isUUID().withMessage('El medico_id debe ser un UUID válido'),

  body('fecha')
    .trim()
    .notEmpty().withMessage('La fecha y hora de la cita son obligatorias')
    .matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
    .withMessage('La fecha debe tener formato ISO 8601 (YYYY-MM-DDTHH:mm)')
    .custom((val) => {
      const fechaCita = new Date(val);
      if (isNaN(fechaCita.getTime())) {
        throw new Error('La fecha proporcionada no es válida');
      }
      const ahora = new Date();
      if (fechaCita.getTime() < ahora.getTime() - 60000) {
        throw new Error('La fecha de la cita no puede ser en el pasado');
      }
      return true;
    }),

  body('motivo')
    .trim()
    .notEmpty().withMessage('El motivo del cambio es obligatorio')
    .isLength({ min: 5, max: 200 })
    .withMessage('El motivo del cambio debe tener entre 5 y 200 caracteres'),
];

/**
 * Reglas de validación para cancelación de citas (C.17):
 * - motivo: trim, obligatorio, entre 5 y 200 caracteres.
 */
const cancelarRules = [
  body('motivo')
    .trim()
    .notEmpty().withMessage('El motivo de cancelación es obligatorio')
    .isLength({ min: 5, max: 200 })
    .withMessage('El motivo de cancelación debe tener entre 5 y 200 caracteres'),
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
  citaRules,
  reprogramarRules,
  cancelarRules,
  validar,
};
