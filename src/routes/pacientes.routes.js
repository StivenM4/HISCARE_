// src/routes/pacientes.routes.js — rutas de interfaz y API para pacientes (C.3, C.15)
const router = require('express').Router();
const { sesion, autorizar } = require('../middlewares/seguridad');
const { pacienteRules, validar } = require('../validators/paciente.validator');
const pacienteController = require('../controllers/paciente.controller');
const atencionController = require('../controllers/atencion.controller');

// Búsqueda y listado general de pacientes (C.15)
router.get(
  '/pacientes',
  sesion,
  autorizar('pacientes', 'L'),
  pacienteController.renderListado
);

// Vista de registro de nuevo paciente (C.3)
router.get(
  '/pacientes/nuevo',
  sesion,
  autorizar('pacientes', 'E'),
  pacienteController.renderNuevo
);

// Ficha clínica única de paciente (C.15)
router.get(
  '/pacientes/:id',
  sesion,
  autorizar('pacientes', 'L'),
  pacienteController.renderDetalle
);

// Verificación en línea de duplicados por documento
router.get(
  '/api/pacientes/existe',
  sesion,
  autorizar('pacientes', 'L'),
  pacienteController.existePaciente
);

// Búsqueda de pacientes vía API (C.15)
router.get(
  ['/api/pacientes/buscar', '/api/pacientes'],
  sesion,
  autorizar('pacientes', 'L'),
  pacienteController.apiBuscar
);

// Resumen del paciente para atención clínica (C.4: id, nombre, documento, edad, sexo, eps, alergias)
router.get(
  '/api/pacientes/:id/resumen',
  sesion,
  autorizar('pacientes', 'L'),
  atencionController.resumenPaciente
);

// Consulta de afiliación en salud (C.15)
router.get(
  '/api/pacientes/:id/afiliacion',
  sesion,
  autorizar('pacientes', 'L'),
  pacienteController.apiAfiliacion
);

// Contactos de emergencia del paciente (C.15)
router.get(
  '/api/pacientes/:id/contactos',
  sesion,
  autorizar('pacientes', 'L'),
  pacienteController.apiGetContactos
);

router.post(
  '/api/pacientes/:id/contactos',
  sesion,
  autorizar('pacientes', 'E'),
  pacienteController.apiCrearContacto
);

// Últimos movimientos del paciente (C.15)
router.get(
  '/api/pacientes/:id/movimientos',
  sesion,
  autorizar('pacientes', 'L'),
  pacienteController.apiMovimientos
);

// Consulta de detalle de paciente por UUID vía API
router.get(
  '/api/pacientes/:id',
  sesion,
  autorizar('pacientes', 'L'),
  pacienteController.apiDetalle
);

// Creación de paciente nuevo con afiliación y contactos (transaccional)
router.post(
  '/api/pacientes',
  sesion,
  autorizar('pacientes', 'E'),
  validar(pacienteRules),
  pacienteController.crearPaciente
);

module.exports = router;
