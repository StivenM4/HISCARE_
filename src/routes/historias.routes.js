// src/routes/historias.routes.js — C.5 Pestaña Antecedentes, C.9 Historia clínica longitudinal y APIs
const router = require('express').Router();
const { sesion, autorizar, soloRol } = require('../middlewares/seguridad');
const cargarAtencion = require('../middlewares/cargarAtencion');
const antecedenteController = require('../controllers/antecedente.controller');
const historiaController = require('../controllers/historia.controller');
const { antecedenteRules, validar } = require('../validators/antecedente.validator');

// ============================================================================
// C.9 Historia clínica longitudinal (Línea de tiempo)
// ============================================================================

// Vista principal de la historia clínica longitudinal (C.9)
router.get(
  '/historias/:pacienteId',
  sesion,
  autorizar('historias', 'L'),
  historiaController.renderTimeline
);

// API para obtener hitos cronológicos unificados de la historia (atenciones, órdenes, resultados)
router.get(
  '/api/historias/:id/timeline',
  sesion,
  autorizar('historias', 'L'),
  historiaController.apiTimeline
);

// API para obtener el resumen clínico detallado de una atención para el panel lateral de C.9
router.get(
  '/api/atenciones/:id/resumen',
  sesion,
  autorizar('historias', 'L'),
  historiaController.apiResumen
);

// ============================================================================
// C.5 Antecedentes clínicos de la historia
// ============================================================================

// Listar antecedentes de la historia clínica (opcional ?tipo=)
router.get(
  '/api/historias/:id/antecedentes',
  sesion,
  autorizar('atenciones', 'L'),
  antecedenteController.apiListarAntecedentes
);

// Registrar antecedente en la historia clínica (restringido a rol MEDICO)
router.post(
  '/api/historias/:id/antecedentes',
  sesion,
  autorizar('atenciones', 'E'),
  soloRol('MEDICO'),
  validar(antecedenteRules),
  antecedenteController.apiCrearAntecedente
);

// Vista de la pestaña Antecedentes (C.5)
router.get(
  '/atenciones/:id/antecedentes',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  antecedenteController.renderAntecedentes
);

module.exports = router;
