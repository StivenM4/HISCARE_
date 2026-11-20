// src/routes/ordenes.routes.js — Rutas para pantalla C.7 y C.8 (Órdenes diagnósticas)
const router = require('express').Router();
const { sesion, autorizar, soloRol } = require('../middlewares/seguridad');
const cargarAtencion = require('../middlewares/cargarAtencion');
const ordenController = require('../controllers/orden.controller');
const integracionController = require('../controllers/integracion.controller');
const { ordenRules, validar } = require('../validators/orden.validator');

// Listado de órdenes diagnósticas
router.get(
  '/ordenes',
  sesion,
  autorizar('ordenes', 'L'),
  ordenController.listarOrdenes
);

// API para listar órdenes diagnósticas
router.get(
  '/api/ordenes',
  sesion,
  autorizar('ordenes', 'L'),
  ordenController.listarOrdenes
);

// Vista de generación de orden diagnóstica (C.7)
router.get(
  '/atenciones/:id/ordenes',
  sesion,
  autorizar('ordenes', 'L'),
  cargarAtencion,
  ordenController.renderOrdenNueva
);

// Autocompletado de catálogo CUPS (C.7)
router.get(
  '/api/cups/buscar',
  sesion,
  ordenController.apiBuscarCups
);

// Listado JSON de órdenes diagnósticas de una atención (C.7)
router.get(
  '/api/atenciones/:id/ordenes',
  sesion,
  autorizar('ordenes', 'L'),
  cargarAtencion,
  ordenController.apiListarOrdenesAtencion
);

// Emisión de orden diagnóstica (C.7)
router.post(
  '/api/atenciones/:id/ordenes',
  sesion,
  autorizar('ordenes', 'E'),
  cargarAtencion,
  validar(ordenRules),
  ordenController.apiCrearOrden
);

// Vista de impresión de orden diagnóstica (C.8)
router.get(
  '/ordenes/:id/imprimir',
  sesion,
  autorizar('ordenes', 'L'),
  ordenController.renderImprimir
);

// Alias de impresión
router.get(
  '/ordenes/:id/impresion',
  sesion,
  autorizar('ordenes', 'L'),
  ordenController.renderImprimir
);

// =====================================================================
// Pantalla C.23 — Despacho de órdenes a sistemas externos, reintentos y reenvío
// =====================================================================

// Vista de monitoreo y despacho
router.get(
  '/ordenes/integraciones',
  sesion,
  autorizar('ordenes', 'L'),
  integracionController.renderIntegraciones
);

// Métricas y resumen por estado (ENVIADO, PENDIENTE, REINTENTO, ERROR)
router.get(
  '/api/integraciones/resumen',
  sesion,
  autorizar('ordenes', 'L'),
  integracionController.apiResumen
);

// Listado paginado y filtrable de integraciones
router.get(
  '/api/integraciones',
  sesion,
  autorizar('ordenes', 'L'),
  integracionController.apiListar
);

// Detalle individual de integración
router.get(
  '/api/integraciones/:id',
  sesion,
  autorizar('ordenes', 'L'),
  integracionController.apiDetalle
);

// Reenvío manual de órdenes en ERROR (solo ADMINISTRADOR)
router.post(
  '/api/integraciones/:id/reenviar',
  sesion,
  autorizar('ordenes', 'E'),
  soloRol('ADMINISTRADOR'),
  integracionController.apiReenviar
);

module.exports = router;
