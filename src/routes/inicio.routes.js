// src/routes/inicio.routes.js — rutas del dashboard de la jornada y APIs asociadas (C.2)
const express = require('express');
const router = express.Router();
const { sesion, autorizar } = require('../middlewares/seguridad');
const { inicioPorRol } = require('../config/permisos');
const inicioController = require('../controllers/inicio.controller');

// GET / — redirige a la vista inicial según rol o renderiza el dashboard
router.get('/', (req, res, next) => {
  if (!req.session || !req.session.usuario) {
    return res.redirect('/auth/login');
  }
  const rol = req.session.usuario.rol;
  const destino = rol && inicioPorRol[rol];
  if (destino) {
    return res.redirect(destino);
  }
  return inicioController.renderDashboard(req, res, next);
});

// GET /inicio — vista del dashboard de la jornada
router.get('/inicio', sesion, autorizar('inicio', 'L'), inicioController.renderDashboard);

// GET /dashboard — vista de accesos rápidos tras iniciar sesión
router.get('/dashboard', sesion, autorizar('inicio', 'L'), inicioController.renderAccesosDashboard);

// Ruta protegida de auditoría (para evaluar RBAC y dar soporte a inicioPorRol del AUDITOR)
router.get('/auditoria', sesion, autorizar('auditoria', 'L'), (req, res) => {
  res.render('auditoria/auditoria_listado', { titulo: 'Auditoría' });
});

// GET /api/metricas/dashboard — KPIs de la jornada
router.get('/api/metricas/dashboard', sesion, autorizar('inicio', 'L'), inicioController.getMetricas);

// GET /api/agenda — citas del día
router.get('/api/agenda', sesion, autorizar('agenda', 'L'), inicioController.getAgenda);

module.exports = router;
