// src/routes/citas.routes.js — C.16 agendar y C.18 agenda diaria (vistas + API)
const router = require('express').Router();
const { sesion, autorizar, soloRol } = require('../middlewares/seguridad');
const {
  citaRules,
  reprogramarRules,
  cancelarRules,
  validar,
} = require('../validators/cita.validator');
const citaController = require('../controllers/cita.controller');

// ---------- Vistas ----------
router.get('/agenda', sesion, autorizar('agenda', 'L'), citaController.agendaDiaria);

router.get('/citas/nueva', sesion, autorizar('agenda', 'E'), citaController.renderNuevaCita);
router.get('/citas/:id', sesion, autorizar('agenda', 'L'), citaController.renderGestionCita);

// ---------- API C.16 ----------
router.get('/api/especialidades/:id/profesionales', sesion, citaController.getProfesionalesPorEspecialidad);

router.get('/api/agenda/:medicoId/franjas', sesion, autorizar('agenda', 'L'), citaController.getFranjas);

router.post('/api/citas', sesion, autorizar('agenda', 'E'), validar(citaRules), citaController.crearCita);

// ---------- API C.17 ----------
router.get('/api/citas/:id', sesion, autorizar('agenda', 'L'), citaController.getCitaDetalle);

router.get('/api/citas/:id/historial', sesion, autorizar('agenda', 'L'), citaController.getHistorialCita);

router.post(
  '/api/citas/:id/reprogramar',
  sesion,
  autorizar('agenda', 'E'),
  validar(reprogramarRules),
  citaController.reprogramarCita
);

router.post(
  '/api/citas/:id/cancelar',
  sesion,
  autorizar('agenda', 'E'),
  validar(cancelarRules),
  citaController.cancelarCita
);

// ---------- API C.18 ----------
router.get('/api/agenda/diaria', sesion, autorizar('agenda', 'L'), citaController.apiAgendaDiaria);

router.patch('/api/citas/:id/estado', sesion, autorizar('agenda', 'E'), citaController.cambiarEstado);

router.post('/api/citas/:id/atencion', sesion, autorizar('atenciones', 'E'), soloRol('MEDICO'), citaController.iniciarAtencion);

router.get('/api/agenda/:medicoId/sala', sesion, autorizar('agenda', 'L'), citaController.getSalaEspera);

module.exports = router;
