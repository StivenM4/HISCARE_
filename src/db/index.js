// src/db/index.js — pool de PostgreSQL y transacción con contexto de auditoría
const { Pool } = require('pg');

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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS || '5000', 10),
});

pool.on('error', (err) => {
  logger.error('Error inesperado en cliente inactivo del pool de base de datos', {
    error: err.message,
    stack: err.stack,
  });
});

// Transacción con contexto de auditoría
async function tx(ctx = {}, fn) {
  if (typeof ctx === 'function') {
    fn = ctx;
    ctx = {};
  }
  const safeCtx = ctx || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('hiscare.usuario_id', $1, true), set_config('hiscare.ip_origen', $2, true)",
      [String(safeCtx.usuarioId || ''), String(safeCtx.ip || '')]
    );
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function queryConCtx(ctx, sql, params) {
  return tx(ctx, (c) => c.query(sql, params));
}

const query = (sql, params, ctx) => {
  if (ctx && (ctx.usuarioId || ctx.ip)) {
    return queryConCtx(ctx, sql, params);
  }
  return pool.query(sql, params);
};

// Contexto a partir de la petición
const ctxDe = (req) => ({
  usuarioId: req && req.session && req.session.usuario ? req.session.usuario.id : '',
  ip: req && req.ip ? String(req.ip).replace('::ffff:', '') : '',
  rol: req && req.session && req.session.usuario ? req.session.usuario.rol : null,
});

module.exports = { pool, query, queryConCtx, tx, ctxDe };
