// src/routes/health.routes.js — endpoint de health check local (Pantalla C.27, HIS-NF-02)
const router = require('express').Router();
const db = require('../db');

const IPS_LOOPBACK = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  'localhost',
]);

function esIpLoopback(ip) {
  if (!ip) return false;
  const normalizada = ip.replace('::ffff:', '').trim();
  return IPS_LOOPBACK.has(normalizada) || normalizada.startsWith('127.');
}

function esLoopback(req) {
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || '';
  return esIpLoopback(ip);
}

router.get('/health', async (req, res) => {
  if (!esLoopback(req)) {
    return res.status(403).json({
      ok: false,
      error: {
        codigo: 'ACCESO_DENEGADO',
        mensaje: 'Endpoint de salud restringido a loopback local',
      },
    });
  }

  try {
    await db.query('SELECT 1');
    return res.status(200).json({ app: 'ok', db: 'ok' });
  } catch (err) { // eslint-disable-line no-unused-vars
    return res.status(503).json({ app: 'ok', db: 'error' });
  }
});

module.exports = router;
