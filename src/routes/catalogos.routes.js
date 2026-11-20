// src/routes/catalogos.routes.js — rutas para catálogos y búsquedas predictivas (CUPS, CIE-10)
const router = require('express').Router();
const { sesion } = require('../middlewares/seguridad');
const codificacionController = require('../controllers/codificacion.controller');

// Búsqueda predictiva de diagnósticos CIE-10 (C.20)
router.get(
  ['/api/cie10/buscar', '/api/cie10'],
  sesion,
  codificacionController.apiBuscarCie10
);

// Búsqueda predictiva de procedimientos CUPS (C.20, C.7)
router.get(
  ['/api/cups/buscar', '/api/cups'],
  sesion,
  codificacionController.apiBuscarCups
);

module.exports = router;
