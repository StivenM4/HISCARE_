// src/routes/aseguradoras.routes.js — endpoints de catálogo de aseguradoras y EPS (C.14, HIS-F-06, PAC-04, PAC-08)
const router = require('express').Router();
const { sesion, autorizar } = require('../middlewares/seguridad');
const {
  aseguradoraCrearRules,
  aseguradoraEditarRules,
  aseguradoraEstadoRules,
  validar,
} = require('../validators/aseguradora.validator');
const aseguradoraController = require('../controllers/aseguradora.controller');

// =====================================================================
// PANTALLA C.14: Catálogo de EPS y entidades aseguradoras (HIS-F-06)
// =====================================================================

// Vista de administración del catálogo de EPS y aseguradoras
router.get(
  '/admin/aseguradoras',
  sesion,
  autorizar('admin', 'L'),
  aseguradoraController.renderAdminAseguradoras
);

// Catálogo de aseguradoras para select de afiliación (C.3 / C.15) y administración (C.14)
router.get(
  '/api/aseguradoras',
  sesion,
  aseguradoraController.getAsuguradoras
);

// Detalle de aseguradora por ID
router.get(
  '/api/aseguradoras/:id',
  sesion,
  autorizar('admin', 'L'),
  aseguradoraController.getAsuguradoraPorId
);

// Creación de nueva entidad aseguradora
router.post(
  '/api/aseguradoras',
  sesion,
  autorizar('admin', 'E'),
  validar(aseguradoraCrearRules),
  aseguradoraController.postAseguradora
);

// Edición de aseguradora existente
router.put(
  '/api/aseguradoras/:id',
  sesion,
  autorizar('admin', 'E'),
  validar(aseguradoraEditarRules),
  aseguradoraController.putAseguradora
);

// Modificación de estado activo/inactivo (vigente/no vigente)
router.patch(
  '/api/aseguradoras/:id/estado',
  sesion,
  autorizar('admin', 'E'),
  validar(aseguradoraEstadoRules),
  aseguradoraController.patchEstadoAseguradora
);

// Eliminación física de aseguradora (solo permitida si no tiene afiliados asociados)
router.delete(
  '/api/aseguradoras/:id',
  sesion,
  autorizar('admin', 'E'),
  aseguradoraController.deleteAseguradora
);

module.exports = router;
