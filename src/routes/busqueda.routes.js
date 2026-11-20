// src/routes/busqueda.routes.js — buscador global de pacientes y órdenes (C.2 [2.11])
const express = require('express');
const router = express.Router();
const db = require('../db');
const { sesion } = require('../middlewares/seguridad');

router.get('/api/busqueda', sesion, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();

    // Validar longitud: entre 3 y 50 caracteres (si no cumple o no viene, responder listas vacías)
    if (q.length < 3 || q.length > 50) {
      return res.json({ ok: true, data: { pacientes: [], ordenes: [] } });
    }

    let pacientes = [];
    let ordenes = [];

    if (/^\d+$/.test(q)) {
      // 1. Numérico: buscar pacientes por número de documento
      const { rows } = await db.query(
        `SELECT
           id,
           tipo_documento || ' ' || numero_documento AS documento,
           numero_documento,
           nombres || ' ' || apellidos AS nombre
         FROM pacientes
         WHERE numero_documento LIKE $1 || '%'
         ORDER BY numero_documento ASC
         LIMIT 5`,
        [q]
      );
      pacientes = rows.map((r) => ({
        id: r.id,
        documento: r.documento,
        numero_documento: r.numero_documento,
        nombre: r.nombre,
      }));
    } else if (q.toUpperCase().startsWith('ORD-') || q.toUpperCase() === 'ORD') {
      // 2. Prefijo de orden: buscar órdenes diagnósticas por código
      const { rows } = await db.query(
        `SELECT
           id,
           codigo,
           estado
         FROM ordenes_diagnosticas
         WHERE codigo ILIKE $1 || '%'
         ORDER BY fecha DESC
         LIMIT 5`,
        [q]
      );
      ordenes = rows.map((r) => ({
        id: r.id,
        codigo: r.codigo,
        estado: r.estado,
      }));
    } else {
      // 3. Texto: buscar pacientes por nombres o apellidos
      const { rows } = await db.query(
        `SELECT
           id,
           tipo_documento || ' ' || numero_documento AS documento,
           numero_documento,
           nombres || ' ' || apellidos AS nombre
         FROM pacientes
         WHERE (nombres || ' ' || apellidos) ILIKE '%' || $1 || '%'
         ORDER BY nombres ASC, apellidos ASC
         LIMIT 5`,
        [q]
      );
      pacientes = rows.map((r) => ({
        id: r.id,
        documento: r.documento,
        numero_documento: r.numero_documento,
        nombre: r.nombre,
      }));
    }

    res.json({ ok: true, data: { pacientes, ordenes } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
