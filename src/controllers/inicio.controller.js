// src/controllers/inicio.controller.js — controlador para dashboard y layout común (C.2)
const metricasService = require('../services/metricas.service');
const { accesosRapidosPorRol, puede } = require('../config/permisos');

const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Valida si una cadena tiene el formato estricto ISO YYYY-MM-DD y es una fecha válida.
 */
function esFechaValida(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

/**
 * Renderiza la vista de accesos rápidos (/dashboard) al iniciar sesión.
 */
function renderAccesosDashboard(req, res, next) {
  try {
    const usuario = req.session ? req.session.usuario : null;
    const accesosRapidos = accesosRapidosPorRol(usuario && usuario.rol);
    return res.render('dashboard/index', {
      titulo: 'Dashboard',
      usuario,
      accesosRapidos,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Renderiza la vista principal del dashboard con los datos de la jornada.
 */
async function renderDashboard(req, res, next) {
  try {
    const ahora = new Date();
    let fechaISO = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    if (req.query.fecha && esFechaValida(req.query.fecha)) {
      fechaISO = req.query.fecha;
    }
    const [y, m, d] = fechaISO.split('-').map(Number);
    const fechaCO = new Date(y, m - 1, d);
    const diaNombre = diasSemana[fechaCO.getDay()];
    const diaCapitalizado = diaNombre.charAt(0).toUpperCase() + diaNombre.slice(1);

    const partes = fechaISO.split('-');
    const fechaFormateada = `${partes[2]}/${partes[1]}/${partes[0]}`;

    const usuario = req.session ? req.session.usuario : null;
    const puedeVerAgenda = Boolean(usuario && puede(usuario.rol, 'agenda', 'L'));

    const [citas, metricas] = await Promise.all([
      puedeVerAgenda
        ? metricasService.agendaDia({ fecha: fechaISO, usuario })
        : Promise.resolve([]),
      metricasService.dashboard(usuario, fechaISO),
    ]);

    res.render('inicio/dashboard', {
      fechaHoy: fechaISO,
      diaNombre: diaCapitalizado,
      fechaFormateada,
      jornadaTexto: `Jornada del ${diaCapitalizado} ${fechaFormateada}`,
      citas,
      metricas,
      titulo: 'Inicio',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/metricas/dashboard
 * Retorna { citasHoy, enSala, ordenesPendientes, alertas }
 */
async function getMetricas(req, res, next) {
  try {
    const { fecha } = req.query;
    if (fecha !== undefined && fecha !== '' && !esFechaValida(fecha)) {
      return res.status(422).json({
        ok: false,
        error: { codigo: 'FECHA_INVALIDA', mensaje: 'Formato de fecha inválido' },
      });
    }

    const usuario = req.session ? req.session.usuario : null;
    const data = await metricasService.dashboard(usuario, fecha || undefined);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/agenda
 * Retorna las citas del día [{ cita_id, hora, paciente_id, paciente, medico, estado }]
 */
async function getAgenda(req, res, next) {
  try {
    const { fecha, medico } = req.query;

    if (fecha !== undefined && fecha !== '' && !esFechaValida(fecha)) {
      return res.status(422).json({
        ok: false,
        error: { codigo: 'FECHA_INVALIDA', mensaje: 'Formato de fecha inválido' },
      });
    }

    const usuario = req.session ? req.session.usuario : null;
    const citas = await metricasService.agendaDia({
      fecha: fecha || undefined,
      medicoId: medico,
      usuario,
    });

    res.json({ ok: true, data: citas });
  } catch (err) {
    next(err);
  }
}

const notificacionService = require('../services/notificacion.service');

/**
 * GET /api/notificaciones/no-leidas/conteo
 * Retorna { conteo }
 */
async function getNotificacionesConteo(req, res, next) {
  try {
    const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
    const { conteo } = await notificacionService.conteoNoLeidas(usuarioId);
    res.json({ ok: true, data: { conteo }, conteo });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  renderAccesosDashboard,
  renderDashboard,
  getMetricas,
  getAgenda,
  getNotificacionesConteo,
  esFechaValida,
};
