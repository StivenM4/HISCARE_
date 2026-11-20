// src/validators/especialidad.validator.js — validaciones para Pantalla C.13 (Especialidades y Agendas)
const { body, param, validationResult } = require('express-validator');

// Reglas para creación de especialidad: POST /api/especialidades
const especialidadCrearRules = [
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre de la especialidad es obligatorio')
    .isLength({ min: 3, max: 100 }).withMessage('El nombre de la especialidad debe tener entre 3 y 100 caracteres'),
];

// Reglas para edición de especialidad: PUT /api/especialidades/:id
const especialidadEditarRules = [
  param('id')
    .isUUID().withMessage('El identificador de la especialidad debe ser un UUID válido'),

  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre de la especialidad es obligatorio')
    .isLength({ min: 3, max: 100 }).withMessage('El nombre de la especialidad debe tener entre 3 y 100 caracteres'),
];

// Reglas para asignación de especialidades a médico: POST /api/usuarios/:id/especialidades
const especialidadAsignarRules = [
  param('id')
    .isUUID().withMessage('El identificador de usuario debe ser un UUID válido'),

  body('especialidad_ids')
    .isArray().withMessage('especialidad_ids debe ser un arreglo de identificadores UUID')
    .custom((arr) => {
      const regexUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (typeof item !== 'string' || !regexUuid.test(item.trim())) {
          throw new Error(`El elemento en la posición ${i + 1} no es un UUID válido`);
        }
      }
      return true;
    }),
];

// Reglas para configuración de horario de médico: PUT /api/usuarios/:id/horario
const horarioGuardarRules = [
  param('id')
    .isUUID().withMessage('El identificador de médico debe ser un UUID válido'),

  body()
    .custom((bodyData) => {
      // Admite tanto un arreglo directo en body como un objeto { horario: [...] }
      const filas = Array.isArray(bodyData)
        ? bodyData
        : (bodyData && Array.isArray(bodyData.horario) ? bodyData.horario : null);

      if (!filas) {
        throw new Error('Debe proporcionar un arreglo con las franjas horarias (campo "horario")');
      }

      for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        const num = i + 1;

        if (!f || typeof f !== 'object') {
          throw new Error(`La franja ${num} tiene un formato inválido`);
        }

        const dia = parseInt(f.dia_semana, 10);
        if (isNaN(dia) || dia < 1 || dia > 7) {
          throw new Error(`Franja ${num}: dia_semana debe ser un número entero entre 1 (lunes) y 7 (domingo)`);
        }

        if (typeof f.hora_inicio !== 'string' || !f.hora_inicio.trim()) {
          throw new Error(`Franja ${num}: hora_inicio es obligatoria`);
        }

        if (typeof f.hora_fin !== 'string' || !f.hora_fin.trim()) {
          throw new Error(`Franja ${num}: hora_fin es obligatoria`);
        }

        const horaInicio = f.hora_inicio.trim();
        const horaFin = f.hora_fin.trim();

        if (horaFin <= horaInicio) {
          throw new Error('La hora de fin debe ser posterior a la hora de inicio');
        }

        if (f.duracion_cita !== undefined && f.duracion_cita !== null) {
          const dur = parseInt(f.duracion_cita, 10);
          if (isNaN(dur) || dur < 10 || dur > 120) {
            throw new Error(`Franja ${num}: duracion_cita debe estar entre 10 y 120 minutos`);
          }
        }
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
  especialidadCrearRules,
  especialidadEditarRules,
  especialidadAsignarRules,
  horarioGuardarRules,
  validar,
};
