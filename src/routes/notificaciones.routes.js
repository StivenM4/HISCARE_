// src/routes/notificaciones.routes.js — Rutas de notificaciones y alertas clínicas (Pantalla C.11)
const express = require('express');
const router = express.Router();
const { sesion } = require('../middlewares/seguridad');
const notificacionController = require('../controllers/notificacion.controller');

// API: Conteo de no leídas para la campana de avisos (C.2 [2.12], C.11 [11.11])
router.get('/api/notificaciones/no-leidas/conteo', sesion, notificacionController.getConteo);

// API: Listado paginado y filtrable de notificaciones
router.get('/api/notificaciones', sesion, notificacionController.getNotificaciones);

// API: Marcar todas las notificaciones como leídas (C.11 [11.51])
router.patch('/api/notificaciones/leidas', sesion, notificacionController.marcarTodasLeidas);
router.patch('/api/notificaciones/leer-todas', sesion, notificacionController.marcarTodasLeidas);

// API: Marcar una notificación individual como leída
router.patch('/api/notificaciones/:id/leida', sesion, notificacionController.marcarLeida);
router.patch('/api/notificaciones/:id/leer', sesion, notificacionController.marcarLeida);

// Vista: Centro de notificaciones y alertas clínicas (Pantalla C.11)
router.get('/notificaciones', sesion, notificacionController.renderListado);

module.exports = router;
