// src/validators/codificacion.validator.js — Validaciones para codificación CIE-10 y CUPS (C.20)
const { body, validationResult } = require('express-validator');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reglas de validación para guardar codificación (POST /api/atenciones/:id/codificacion).
 */
const codificacionRules = [
  body('diagnosticos')
    .isArray({ min: 1 })
    .withMessage('Debe incluir al menos un diagnóstico en la atención'),

  body('diagnosticos.*.cie10_id')
    .notEmpty()
    .withMessage('El identificador del diagnóstico CIE-10 es obligatorio')
    .matches(UUID_REGEX)
    .withMessage('El identificador cie10_id debe ser un UUID válido'),

  body('diagnosticos.*.tipo')
    .notEmpty()
    .withMessage('El tipo de diagnóstico es obligatorio')
    .isIn(['PRINCIPAL', 'SECUNDARIO'])
    .withMessage("El tipo de diagnóstico debe ser 'PRINCIPAL' o 'SECUNDARIO'"),

  body('procedimientos')
    .optional({ nullable: true })
    .isArray()
    .withMessage('El listado de procedimientos debe ser un array'),

  body('procedimientos.*.cups_id')
    .optional()
    .matches(UUID_REGEX)
    .withMessage('El identificador cups_id debe ser un UUID válido'),

  body('procedimientos.*.fecha')
    .optional({ checkFalsy: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('La fecha del procedimiento debe tener formato YYYY-MM-DD'),
];

/**
 * Middleware de validación para codificación.
 * - Detecta si se enviaron más de un PRINCIPAL y responde 409 (Conflicto / regla de negocio).
 * - Detecta diagnósticos duplicados o ausencia de PRINCIPAL y responde 422.
 * - Máximo 10 diagnósticos secundarios.
 */
function validarCodificacion(req, res, next) {
  // Primero ejecutamos las validaciones estructurales de express-validator
  Promise.all(codificacionRules.map((r) => r.run(req))).then(() => {
    const diagnosticos = req.body && Array.isArray(req.body.diagnosticos) ? req.body.diagnosticos : null;

    if (diagnosticos && diagnosticos.length > 0) {
      let countPrincipal = 0;
      let countSecundario = 0;
      const cie10Ids = new Set();
      let duplicado = false;

      for (const d of diagnosticos) {
        if (!d || typeof d !== 'object') continue;
        if (d.tipo === 'PRINCIPAL') {
          countPrincipal++;
        } else if (d.tipo === 'SECUNDARIO') {
          countSecundario++;
        }

        if (d.cie10_id) {
          if (cie10Ids.has(d.cie10_id)) {
            duplicado = true;
          }
          cie10Ids.add(d.cie10_id);
        }
      }

      // Regla C.20 / UAT: Marcar dos principales -> 409 DUPLICADO_PRINCIPAL
      if (countPrincipal > 1) {
        return res.status(409).json({
          ok: false,
          error: {
            codigo: 'DUPLICADO_PRINCIPAL',
            mensaje: 'Solo puede existir un diagnóstico principal',
          },
        });
      }

      if (duplicado) {
        return res.status(422).json({
          ok: false,
          error: {
            codigo: 'VALIDACION_FALLIDA',
            mensaje: 'No se permiten diagnósticos duplicados en la atención',
            campos: [{ campo: 'diagnosticos', mensaje: 'Diagnóstico duplicado' }],
          },
        });
      }

      if (countPrincipal === 0) {
        return res.status(422).json({
          ok: false,
          error: {
            codigo: 'VALIDACION_FALLIDA',
            mensaje: 'Debe especificar exactamente un diagnóstico PRINCIPAL',
            campos: [{ campo: 'diagnosticos', mensaje: 'Falta diagnóstico principal' }],
          },
        });
      }

      if (countSecundario > 10) {
        return res.status(422).json({
          ok: false,
          error: {
            codigo: 'VALIDACION_FALLIDA',
            mensaje: 'No puede registrar más de 10 diagnósticos secundarios',
            campos: [{ campo: 'diagnosticos', mensaje: 'Máximo 10 secundarios' }],
          },
        });
      }
    }

    const errores = validationResult(req);
    if (!errores.isEmpty()) {
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
    }

    return next();
  }).catch(next);
}

module.exports = {
  codificacionRules,
  validarCodificacion,
  validar: validarCodificacion,
};
