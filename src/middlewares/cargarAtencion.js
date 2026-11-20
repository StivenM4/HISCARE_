// src/middlewares/cargarAtencion.js — carga atención e historia, establece soloLectura
const db = require('../db');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esApi = (req) =>
  req.originalUrl.startsWith('/api/') ||
  req.xhr ||
  (req.headers.accept && req.headers.accept.includes('application/json'));

/**
 * Middleware para cargar la atención y asociarla al ciclo de vida de la petición.
 * - Consulta atenciones unida a historias_clinicas.
 * - Si no existe, responde 404 (JSON si API, render 404 si vista).
 * - res.locals.atencion = atencion.
 * - res.locals.soloLectura = (atencion.estado === 'CERRADA').
 * - Si el usuario en sesión es MEDICO y no es el médico tratante de la atención, soloLectura = true.
 * - req.atencion = atencion.
 */
async function cargarAtencion(req, res, next) {
  try {
    const atencionId = req.params.id;
    if (!atencionId || !UUID_REGEX.test(atencionId)) {
      if (esApi(req)) {
        return res.status(404).json({
          ok: false,
          error: {
            codigo: 'ATENCION_NO_ENCONTRADA',
            mensaje: 'Atención no encontrada',
          },
        });
      }
      return res.status(404).render('errores/404', {
        titulo: 'Atención no encontrada',
        mensaje: 'La atención solicitada no fue encontrada en el sistema.',
      });
    }

    const { rows: [atencion] } = await db.query(
      'SELECT a.*, h.paciente_id FROM atenciones a JOIN historias_clinicas h ON h.id=a.historia_id WHERE a.id=$1',
      [atencionId]
    );

    if (!atencion) {
      if (esApi(req)) {
        return res.status(404).json({
          ok: false,
          error: {
            codigo: 'ATENCION_NO_ENCONTRADA',
            mensaje: 'Atención no encontrada',
          },
        });
      }
      return res.status(404).render('errores/404', {
        titulo: 'Atención no encontrada',
        mensaje: 'La atención solicitada no fue encontrada en el sistema.',
      });
    }

    let soloLectura = (atencion.estado === 'CERRADA');
    const usuario = req.session && req.session.usuario;
    if (usuario && usuario.rol === 'MEDICO' && atencion.medico_id !== usuario.id) {
      soloLectura = true;
    }

    res.locals.atencion = atencion;
    res.locals.soloLectura = soloLectura;
    req.atencion = atencion;

    return next();
  } catch (err) {
    return next(err);
  }
}

cargarAtencion.cargarAtencion = cargarAtencion;
module.exports = cargarAtencion;
