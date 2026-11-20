// src/routes/resultados.routes.js — Rutas para pantallas C.24 (Carga) y C.25 (Consulta de resultados)
const router = require('express').Router();
const { sesion, autorizar } = require('../middlewares/seguridad');
const uploadMiddleware = require('../middlewares/upload');
const resultadoController = require('../controllers/resultado.controller');

// Redirección principal del módulo de resultados
router.get('/resultados', (req, res) => res.redirect('/resultados/carga'));

// Vista de carga de resultados diagnósticos (Pantalla C.24)
router.get(
  '/resultados/carga',
  sesion,
  autorizar('resultados', 'E'),
  resultadoController.renderCarga
);

// Visor de resultados diagnósticos por ID de resultado (Pantalla C.25)
router.get(
  '/resultados/:id',
  sesion,
  autorizar('resultados', 'L'),
  resultadoController.renderVisor
);

// Visor de resultados diagnósticos por ID de paciente (Pantalla C.25)
router.get(
  '/pacientes/:id/resultados',
  sesion,
  autorizar('resultados', 'L'),
  resultadoController.renderVisor
);

// Búsqueda de orden diagnóstica por código o ID (Pantalla C.24)
router.get(
  '/api/ordenes/:codigo',
  sesion,
  autorizar('resultados', 'E'),
  resultadoController.buscarOrden
);

// Carga de resultados diagnósticos con archivo adjunto validado (Pantalla C.24)
router.post(
  '/api/ordenes/:id/resultados',
  sesion,
  autorizar('resultados', 'E'),
  uploadMiddleware,
  resultadoController.guardarResultado
);

// API C.25: Listar resultados de un paciente
router.get(
  '/api/pacientes/:id/resultados',
  sesion,
  autorizar('resultados', 'L'),
  resultadoController.apiResultadosPaciente
);

// API C.25: Detalle de un resultado diagnóstico
router.get(
  '/api/resultados/:id',
  sesion,
  autorizar('resultados', 'L'),
  resultadoController.apiDetalleResultado
);

// API C.25: Descarga o streaming seguro del archivo adjunto
router.get(
  '/api/resultados/:id/archivo',
  sesion,
  autorizar('resultados', 'L'),
  resultadoController.apiArchivoResultado
);

// API C.25: Marcar resultado como revisado
router.patch(
  '/api/resultados/:id/revisado',
  sesion,
  autorizar('resultados', 'E'),
  resultadoController.apiMarcarRevisado
);

module.exports = router;

