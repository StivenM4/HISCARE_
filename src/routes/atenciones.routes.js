// src/routes/atenciones.routes.js — C.4 Consulta, C.5 Antecedentes, C.6 Evolución SOAP
const router = require('express').Router();
const { sesion, autorizar, soloRol } = require('../middlewares/seguridad');
const cargarAtencion = require('../middlewares/cargarAtencion');
const atencionController = require('../controllers/atencion.controller');
const antecedenteController = require('../controllers/antecedente.controller');
const evolucionController = require('../controllers/evolucion.controller');
const { motivoRules, signosRules, validar } = require('../validators/atencion.validator');
const { firmarEvolucionRules, validar: validarEvolucion } = require('../validators/evolucion.validator');
const consentimientoController = require('../controllers/consentimiento.controller');
const { consentimientoRules, validar: validarConsentimiento } = require('../validators/consentimiento.validator');
const codificacionController = require('../controllers/codificacion.controller');
const { validarCodificacion } = require('../validators/codificacion.validator');
const notaAltaController = require('../controllers/nota_alta.controller');
const { validarNotaAlta } = require('../validators/nota_alta.validator');
const { puede } = require('../config/permisos');
const db = require('../db');
const { adendaRules, validar: validarAdenda } = require('../validators/adenda.validator');


// Listado principal de atenciones clínicas
router.get(
  '/atenciones',
  sesion,
  autorizar('atenciones', 'L'),
  atencionController.listarAtenciones
);

// Vista principal de la pestaña Consulta y signos vitales (C.4)
router.get(
  '/atenciones/:id/consulta',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  atencionController.renderConsulta
);

// Vista principal de la pestaña Antecedentes (C.5)
router.get(
  '/atenciones/:id/antecedentes',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  antecedenteController.renderAntecedentes
);

// Vista principal de la pestaña Evolución SOAP (C.6)
router.get(
  '/atenciones/:id/evolucion',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  evolucionController.renderEvolucion
);

// Actualización definitiva del motivo de consulta
router.put(
  '/api/atenciones/:id',
  sesion,
  autorizar('atenciones', 'E'),
  cargarAtencion,
  validar(motivoRules),
  atencionController.guardarMotivo
);

// Guardado de borrador automático de Consulta (HIS-E-06, HIS-NF-06)
router.put(
  '/api/atenciones/:id/borrador',
  sesion,
  autorizar('atenciones', 'E'),
  cargarAtencion,
  atencionController.guardarBorrador
);

// Registro de toma de signos vitales (con cálculo de IMC en el motor de BD)
router.post(
  '/api/atenciones/:id/signos',
  sesion,
  autorizar('atenciones', 'E'),
  cargarAtencion,
  validar(signosRules),
  atencionController.registrarSignos
);

// Consulta de toma de signos vitales (C.6 - individual o histórico)
router.get(
  '/api/atenciones/:id/signos',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  atencionController.apiSignos
);

// Listado de evoluciones SOAP registradas (C.6)
router.get(
  '/api/atenciones/:id/evoluciones',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  evolucionController.apiListarEvoluciones
);

// Guardado de borrador de evolución SOAP en tiempo real (C.6)
router.put(
  '/api/atenciones/:id/evoluciones/borrador',
  sesion,
  autorizar('atenciones', 'E'),
  cargarAtencion,
  evolucionController.apiGuardarBorrador
);

// Registro definitivo y firma de la evolución médica SOAP (C.6)
router.post(
  '/api/atenciones/:id/evoluciones',
  sesion,
  autorizar('atenciones', 'E'),
  soloRol('MEDICO'),
  cargarAtencion,
  validarEvolucion(firmarEvolucionRules),
  evolucionController.apiFirmarEvolucion
);

// --- Pestaña Consentimientos informados (C.19) ---

// Vista de consentimientos informados de la atención clínica
router.get(
  '/atenciones/:id/consentimientos',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  consentimientoController.renderConsentimientos
);

// Consulta del catálogo de tipos de consentimiento
router.get(
  '/api/consentimientos/tipos',
  sesion,
  consentimientoController.apiObtenerTipos
);

// Listado de consentimientos de la atención clínica
router.get(
  '/api/atenciones/:id/consentimientos',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  consentimientoController.apiListarConsentimientos
);

// Registro de un nuevo consentimiento informado
router.post(
  '/api/atenciones/:id/consentimientos',
  sesion,
  autorizar('atenciones', 'E'),
  soloRol('MEDICO'),
  cargarAtencion,
  validarConsentimiento(consentimientoRules),
  consentimientoController.apiCrearConsentimiento
);

// Firma de un consentimiento informado existente
router.put(
  '/api/atenciones/:id/consentimientos/:consentimientoId',
  sesion,
  autorizar('atenciones', 'E'),
  soloRol('MEDICO'),
  cargarAtencion,
  consentimientoController.apiFirmarConsentimiento
);

router.post(
  '/api/atenciones/:id/consentimientos/:consentimientoId/firmar',
  sesion,
  autorizar('atenciones', 'E'),
  soloRol('MEDICO'),
  cargarAtencion,
  consentimientoController.apiFirmarConsentimiento
);

// --- Pestaña Diagnósticos y Procedimientos (C.20) ---
router.get(
  '/atenciones/:id/diagnosticos',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  codificacionController.renderDiagnosticos
);

router.get(
  '/api/atenciones/:id/codificacion',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  codificacionController.apiObtenerCodificacion
);

router.post(
  '/api/atenciones/:id/codificacion',
  sesion,
  autorizar('atenciones', 'E'),
  soloRol('MEDICO'),
  cargarAtencion,
  validarCodificacion,
  codificacionController.apiGuardarCodificacion
);

// --- Pantalla C.21 - Nota de alta (epicrisis) ---

// Vista de la nota de alta (epicrisis)
router.get(
  '/atenciones/:id/alta',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  notaAltaController.renderNotaAlta
);

// Resumen clínico de la atención (diagnósticos, procedimientos, órdenes y resultados)
router.get(
  '/api/atenciones/:id/resumen',
  sesion,
  autorizar('atenciones', 'L'),
  notaAltaController.apiObtenerResumen
);

// Guardado de borrador automático de nota de alta
router.put(
  '/api/atenciones/:id/alta/borrador',
  sesion,
  autorizar('atenciones', 'E'),
  cargarAtencion,
  notaAltaController.apiGuardarBorrador
);

// Guardado definitivo de la nota de alta (epicrisis)
router.post(
  '/api/atenciones/:id/alta',
  sesion,
  autorizar('atenciones', 'E'),
  soloRol('MEDICO'),
  cargarAtencion,
  validarNotaAlta,
  notaAltaController.apiGuardarNotaAlta
);

// --- Pantalla C.22 - Cierre inmutable y adendas ---

// Middleware que autoriza a usuarios con permiso de lectura en atenciones O en auditoría
const autorizarAtencionOAuditoria = async (req, res, next) => {
  const rol = req.session?.usuario?.rol;
  if (rol && (puede(rol, 'atenciones', 'L') || puede(rol, 'auditoria', 'L'))) {
    return next();
  }

  try {
    await db.tx(db.ctxDe(req), (client) =>
      client.query("SELECT fn_auditar_evento('ACCESO_DENEGADO', $1, NULL, $2)", [
        'atenciones',
        JSON.stringify({ ruta: req.originalUrl, metodo: req.method, rol: rol || null }),
      ])
    );
  } catch (err) {
    return next(err);
  }

  return res.status(403).json({
    ok: false,
    error: { codigo: 'ACCESO_DENEGADO', mensaje: 'No tiene permiso' },
  });
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validarIdAtencionUuid = (req, res, next) => {
  const { id } = req.params;
  if (!id || !UUID_REGEX.test(id)) {
    return res.status(404).json({
      ok: false,
      error: {
        codigo: 'ATENCION_NO_ENCONTRADA',
        mensaje: 'Atención no encontrada',
      },
    });
  }
  next();
};

// Vista principal de cierre de atención inmutable (C.22)
router.get(
  '/atenciones/:id/cierre',
  sesion,
  autorizar('atenciones', 'L'),
  cargarAtencion,
  atencionController.renderCierre
);

// Consulta del checklist de validación previa al cierre
router.get(
  '/api/atenciones/:id/validar-cierre',
  sesion,
  autorizar('atenciones', 'L'),
  validarIdAtencionUuid,
  atencionController.apiValidarCierre
);

// Cierre definitivo e inmutable con generación de firma SHA-256
router.post(
  '/api/atenciones/:id/cerrar',
  sesion,
  autorizar('atenciones', 'E'),
  soloRol('MEDICO'),
  cargarAtencion,
  atencionController.apiCerrarAtencion
);

// Verificación criptográfica del sello SHA-256 (médicos y auditores)
router.get(
  '/api/atenciones/:id/verificar-firma',
  sesion,
  validarIdAtencionUuid,
  autorizarAtencionOAuditoria,
  atencionController.apiVerificarFirma
);

// Listado de adendas de la atención
router.get(
  '/api/atenciones/:id/adendas',
  sesion,
  autorizar('atenciones', 'L'),
  validarIdAtencionUuid,
  atencionController.apiListarAdendas
);

// Creación de nueva adenda clínica inmutable
router.post(
  '/api/atenciones/:id/adendas',
  sesion,
  autorizar('atenciones', 'E'),
  soloRol('MEDICO'),
  validarIdAtencionUuid,
  validarAdenda(adendaRules),
  atencionController.apiCrearAdenda
);

module.exports = router;


