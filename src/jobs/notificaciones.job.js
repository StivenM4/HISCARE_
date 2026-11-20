// src/jobs/notificaciones.job.js — Job de reintento de notificaciones de resultados (HIS-E-09)
const notificacionService = require('../services/notificacion.service');

let cron = null;
try {
  cron = require('node-cron');
} catch (_) {
  // node-cron no está disponible en las dependencias; se usa setInterval
}

let intervaloTimer = null;
let cronTask = null;

/**
 * Ejecuta una pasada del job de reintento de notificaciones (HIS-E-09).
 * Inserta notificaciones para resultados emitidos en las últimas 24 horas
 * que no tengan notificación registrada.
 * @returns {Promise<Array<{ id: string }>>} Filas insertadas
 */
async function ejecutarJob() {
  try {
    const filas = await notificacionService.reintentarNotificacionesPendientes();
    const total = Array.isArray(filas) ? filas.length : 0;
    if (total > 0) {
      console.log(`[Job Notificaciones HIS-E-09] Se generaron ${total} notificación(es) pendiente(s) de resultados.`);
    }
    return filas;
  } catch (err) {
    console.error('[Job Notificaciones HIS-E-09] Error al reintentar notificaciones pendientes:', err.message);
    throw err;
  }
}

/**
 * Inicia la ejecución periódica del job de notificaciones.
 * Utiliza cron cada 5 minutos si node-cron está disponible, o setInterval (5 * 60 * 1000 ms).
 * @param {number} [intervaloMs=300000] Intervalo en ms para setInterval (defecto: 5 minutos)
 * @returns {object|NodeJS.Timeout} Tarea cron o referencia al timer
 */
function iniciarJobNotificaciones(intervaloMs = 5 * 60 * 1000) {
  detenerJobNotificaciones();

  // Ejecución inicial asíncrona sin bloquear arranque
  ejecutarJob().catch(() => {});

  if (cron && typeof cron.schedule === 'function') {
    cronTask = cron.schedule(
      '*/5 * * * *',
      () => {
        ejecutarJob().catch(() => {});
      },
      {
        timezone: process.env.TZ || 'America/Bogota',
        suppressMissedWarning: true,
        missedExecutionTolerance: 30000
      }
    );
    return cronTask;
  }

  intervaloTimer = setInterval(() => {
    ejecutarJob().catch(() => {});
  }, intervaloMs);

  if (intervaloTimer && intervaloTimer.unref) {
    intervaloTimer.unref();
  }

  return intervaloTimer;
}

/**
 * Detiene la ejecución periódica del job.
 */
function detenerJobNotificaciones() {
  if (cronTask && typeof cronTask.stop === 'function') {
    cronTask.stop();
    cronTask = null;
  }
  if (intervaloTimer) {
    clearInterval(intervaloTimer);
    intervaloTimer = null;
  }
}

module.exports = {
  iniciarJobNotificaciones,
  ejecutarJob,
  detenerJobNotificaciones
};
