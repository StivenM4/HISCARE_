// src/jobs/despacho.job.js — Job periódico de despacho de órdenes e intentos automáticos (C.23)
const db = require('../db');
const envioService = require('../services/envio.service');

let logger;
try {
  logger = require('../utils/logger');
} catch (_) {
  logger = {
    info: (msg, meta) => console.log(`[INFO] ${msg}`, meta !== undefined ? meta : ''),
    warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta !== undefined ? meta : ''),
    error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta !== undefined ? meta : ''),
    debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta !== undefined ? meta : ''),
  };
}

let cron = null;
try {
  cron = require('node-cron');
} catch (_) {
  // node-cron no disponible; se usa fallback setInterval
}

let cronTask = null;
let intervaloTimer = null;
let enEjecucion = false;

/**
 * Ejecuta una pasada de despacho sobre órdenes en estado PENDIENTE o REINTENTO
 * cuyo proximo_intento ya se haya cumplido.
 *
 * Implementa el patrón resiliente en 3 fases:
 * 1) Claim TX1 (< 5ms): SELECT ... FOR UPDATE SKIP LOCKED + lease a 5 min y COMMIT.
 * 2) HTTP Fetch fuera de transacción (sin retener cliente ni bloquear pool).
 * 3) Update TX2 (< 5ms): transacción corta que actualiza estado, orden y auditoría.
 *
 * @returns {Promise<Array<object>>} Resultados de los envíos procesados
 */
async function ejecutarJobDespacho() {
  if (enEjecucion) {
    logger.info('[Job Despacho] Ejecución previa en curso, omitiendo ciclo.');
    return [];
  }

  enEjecucion = true;
  const ctx = { usuarioId: '', ip: '127.0.0.1' };

  try {
    // Fase 1: Claim TX1 (< 5ms) — Reclamar hasta 10 integraciones con lease de 5 minutos y liberar conexión
    const reclamadas = await db.tx(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT i.*, o.codigo AS orden_codigo
         FROM integraciones i
         JOIN ordenes_diagnosticas o ON o.id = i.orden_id
         WHERE i.estado_envio IN ('PENDIENTE', 'REINTENTO')
           AND i.proximo_intento <= now()
         ORDER BY i.proximo_intento ASC
         LIMIT 10
         FOR UPDATE SKIP LOCKED`
      );

      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        await client.query(
          `UPDATE integraciones
           SET proximo_intento = now() + interval '5 minutes',
               fecha_modificacion = now()
           WHERE id = ANY($1::uuid[])`,
          [ids]
        );
      }

      return rows;
    });

    const resultados = [];

    // Fases 2 y 3: HTTP Fetch fuera de transacción y Update TX2 dentro de envioService.enviar
    for (const integracion of reclamadas) {
      try {
        const resultado = await envioService.enviar(integracion, null, ctx);
        resultados.push({
          id: integracion.id,
          orden_codigo: integracion.orden_codigo,
          resultado,
        });
      } catch (errEnvio) {
        logger.error(`[Job Despacho] Error en envío de integración ${integracion.id}:`, {
          error: errEnvio.message,
        });
        resultados.push({
          id: integracion.id,
          orden_codigo: integracion.orden_codigo,
          error: errEnvio.message,
        });
      }
    }

    if (resultados.length > 0) {
      logger.info(`[Job Despacho] Procesadas ${resultados.length} integraciones.`);
    }

    return resultados;
  } catch (err) {
    logger.error('[Job Despacho] Error general en ejecución de despacho:', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  } finally {
    enEjecucion = false;
  }
}

/**
 * Inicia la ejecución periódica del job de despacho cada minuto.
 * Usa node-cron si está disponible, o setInterval (60000 ms).
 *
 * @param {number} [intervaloMs=60000] Intervalo de ejecución en milisegundos
 * @returns {object|NodeJS.Timeout} Referencia a la tarea cron o timer
 */
function iniciarJobDespacho(intervaloMs = 60000) {
  detenerJobDespacho();

  // Ejecución inicial no bloqueante
  ejecutarJobDespacho().catch((err) => {
    logger.error('[Job Despacho] Error en ejecución inicial:', { error: err.message });
  });

  if (cron && typeof cron.schedule === 'function') {
    cronTask = cron.schedule(
      '*/1 * * * *',
      () => {
        ejecutarJobDespacho().catch((err) => {
          logger.error('[Job Despacho] Error en ciclo periódico (cron):', { error: err.message });
        });
      },
      {
        timezone: process.env.TZ || 'America/Bogota',
        suppressMissedWarning: true,
        missedExecutionTolerance: 30000,
      }
    );
    return cronTask;
  }

  intervaloTimer = setInterval(() => {
    ejecutarJobDespacho().catch((err) => {
      logger.error('[Job Despacho] Error en ciclo periódico (interval):', { error: err.message });
    });
  }, intervaloMs);

  if (intervaloTimer && intervaloTimer.unref) {
    intervaloTimer.unref();
  }

  return intervaloTimer;
}

/**
 * Detiene el temporizador o tarea cron del job de despacho.
 */
function detenerJobDespacho() {
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
  iniciarJobDespacho,
  detenerJobDespacho,
  ejecutarJobDespacho,
};
