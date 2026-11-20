// src/routes/auditoria.routes.js — rutas para Pantalla C.26 (Bitácora de auditoría forense y reportes de control)
const router = require('express').Router();
const { sesion, autorizar } = require('../middlewares/seguridad');
const { validarFiltros } = require('../validators/auditoria.validator');
const auditoriaController = require('../controllers/auditoria.controller');

// =====================================================================
// PANTALLA C.26: Bitácora de auditoría forense y reportes de control
// Roles permitidos: AUDITOR (L), ADMINISTRADOR (L)
// =====================================================================

// Vista principal de auditoría
router.get(
  '/auditoria',
  sesion,
  autorizar('auditoria', 'L'),
  auditoriaController.renderListado
);

// Consulta de registros de auditoría con keyset pagination
router.get(
  '/api/auditoria',
  sesion,
  autorizar('auditoria', 'L'),
  validarFiltros,
  auditoriaController.getAuditoria
);

// Resumen métrico del periodo
router.get(
  '/api/auditoria/resumen',
  sesion,
  autorizar('auditoria', 'L'),
  validarFiltros,
  auditoriaController.getResumen
);

// Exportación a archivo CSV con streaming
router.get(
  '/api/auditoria/exportar.csv',
  sesion,
  autorizar('auditoria', 'L'),
  validarFiltros,
  auditoriaController.exportarCsv
);

// Detalle forense de un registro de auditoría por UUID
router.get(
  '/api/auditoria/:id',
  sesion,
  autorizar('auditoria', 'L'),
  auditoriaController.getDetalle
);

module.exports = router;
