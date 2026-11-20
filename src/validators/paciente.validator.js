// src/validators/paciente.validator.js — validaciones de entrada para pacientes (C.3)
const { body, validationResult } = require('express-validator');

// Tipos de documento autorizados en el sistema de salud (Anexo C.3 / HIS-F-04)
const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'RC', 'PA', 'PT', 'PE', 'CN', 'AS', 'MS', 'CD'];

// Tipos de usuario de afiliación válidos
const TIPOS_USUARIO = ['Cotizante', 'Beneficiario', 'Particular'];

// Sexo permitido según restricción CHECK pacientes_sexo_check
const SEXOS_PERMITIDOS = ['M', 'F', 'Indeterminado'];

/**
 * Verifica si un teléfono es celular colombiano válido (+57 opcional, 3XXXXXXXXX)
 * o teléfono fijo de 7 a 10 dígitos. Longitud máxima 20 caracteres.
 */
function esTelefonoValido(val) {
  if (!val || typeof val !== 'string') return false;
  const str = val.trim();
  if (str.length > 20) return false;
  const regexCelular = /^(\+?57\s?)?3\d{9}$/;
  const sinEspacios = str.replace(/\s+/g, '');
  const regexFijo = /^\d{7,10}$/;
  return regexCelular.test(str) || regexFijo.test(sinEspacios);
}

// Reglas para POST /api/pacientes
const pacienteRules = [
  // --- Paciente ---
  body('paciente')
    .isObject().withMessage('La información del paciente es obligatoria'),

  body('paciente.tipo_documento')
    .trim()
    .notEmpty().withMessage('El tipo de documento es obligatorio')
    .isIn(TIPOS_DOCUMENTO).withMessage(`El tipo de documento debe ser uno de: ${TIPOS_DOCUMENTO.join(', ')}`),

  body('paciente.numero_documento')
    .trim()
    .notEmpty().withMessage('El número de documento es obligatorio')
    .isLength({ min: 5, max: 20 }).withMessage('El número de documento debe tener entre 5 y 20 caracteres')
    .custom((val, { req }) => {
      const tipo = (req.body?.paciente?.tipo_documento || '').toUpperCase();
      if (['CC', 'TI', 'RC', 'CN'].includes(tipo)) {
        if (!/^\d+$/.test(val)) {
          throw new Error('Para este tipo de documento solo se permiten dígitos');
        }
      } else if (['PA', 'CE', 'PT', 'PE'].includes(tipo)) {
        if (!/^[a-zA-Z0-9]+$/.test(val)) {
          throw new Error('Para este tipo de documento solo se permiten caracteres alfanuméricos');
        }
      }
      return true;
    }),

  body('paciente.nombres')
    .trim()
    .notEmpty().withMessage('Los nombres son obligatorios')
    .isLength({ max: 100 }).withMessage('Los nombres no deben superar los 100 caracteres'),

  body('paciente.apellidos')
    .trim()
    .notEmpty().withMessage('Los apellidos son obligatorios')
    .isLength({ max: 100 }).withMessage('Los apellidos no deben superar los 100 caracteres'),

  body('paciente.fecha_nacimiento')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('La fecha de nacimiento debe tener un formato válido (AAAA-MM-DD)')
    .custom((val) => {
      const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      const valStr = String(val).slice(0, 10);
      if (valStr > hoyStr) {
        throw new Error('La fecha de nacimiento no puede ser mayor a la fecha actual');
      }
      return true;
    }),

  body('paciente.sexo')
    .optional({ checkFalsy: true })
    .isIn(SEXOS_PERMITIDOS).withMessage(`El sexo debe ser uno de: ${SEXOS_PERMITIDOS.join(', ')}`),

  body('paciente.telefono')
    .optional({ checkFalsy: true })
    .isLength({ max: 20 }).withMessage('El teléfono no debe superar los 20 caracteres')
    .custom((val) => {
      if (!esTelefonoValido(val)) {
        throw new Error('El formato de teléfono no es válido (celular +57 3XXXXXXXXX o fijo de 7 a 10 dígitos)');
      }
      return true;
    }),

  body('paciente.direccion')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 }).withMessage('La dirección no debe superar los 200 caracteres'),

  // --- Afiliación ---
  body('afiliacion')
    .isObject().withMessage('La información de afiliación es obligatoria'),

  body('afiliacion.aseguradora_id')
    .trim()
    .notEmpty().withMessage('La aseguradora es obligatoria')
    .isUUID().withMessage('El identificador de aseguradora debe ser un UUID válido'),

  body('afiliacion.tipo_usuario')
    .trim()
    .notEmpty().withMessage('El tipo de usuario es obligatorio')
    .isIn(TIPOS_USUARIO).withMessage(`El tipo de usuario debe ser uno de: ${TIPOS_USUARIO.join(', ')}`),

  body('afiliacion.numero_contrato')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage('El número de contrato no debe superar los 50 caracteres'),

  body('afiliacion.fecha_inicio')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('La fecha de inicio debe tener formato válido (AAAA-MM-DD)'),

  body('afiliacion.fecha_fin')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('La fecha de fin debe tener formato válido (AAAA-MM-DD)')
    .custom((val, { req }) => {
      const inicio = req.body?.afiliacion?.fecha_inicio;
      if (inicio && val) {
        const inicioStr = String(inicio).slice(0, 10);
        const finStr = String(val).slice(0, 10);
        if (finStr < inicioStr) {
          throw new Error('La fecha de fin debe ser posterior o igual a la fecha de inicio');
        }
      }
      return true;
    }),

  // --- Contactos de emergencia ---
  body('contactos')
    .isArray({ min: 1 }).withMessage('Debe incluir al menos un contacto de emergencia'),

  body('contactos.*.nombre')
    .trim()
    .notEmpty().withMessage('El nombre del contacto es obligatorio')
    .isLength({ max: 150 }).withMessage('El nombre del contacto no debe superar los 150 caracteres'),

  body('contactos.*.telefono')
    .trim()
    .notEmpty().withMessage('El teléfono del contacto es obligatorio')
    .isLength({ max: 20 }).withMessage('El teléfono del contacto no debe superar los 20 caracteres')
    .custom((val) => {
      if (!esTelefonoValido(val)) {
        throw new Error('El teléfono del contacto debe ser un celular o número fijo válido');
      }
      return true;
    }),

  body('contactos.*.parentesco')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage('El parentesco no debe superar los 50 caracteres'),
];

/**
 * Middleware que evalúa las reglas de express-validator y devuelve HTTP 422
 * estructurado si existen errores.
 */
function validar(reglas = pacienteRules) {
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
  TIPOS_DOCUMENTO,
  TIPOS_USUARIO,
  SEXOS_PERMITIDOS,
  esTelefonoValido,
  pacienteRules,
  validar,
};
