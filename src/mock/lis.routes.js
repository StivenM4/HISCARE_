// src/mock/lis.routes.js — Simulación de sistemas externos LIS/RIS para pruebas locales y desarrollo (C.23)
const express = require('express');
const router = express.Router();

// Almacén en memoria para registro de id_despacho recibidos (idempotencia)
const despachosRecibidos = new Set();

/**
 * Resetea el conjunto de id_despacho recibidos (útil para pruebas automatizadas).
 */
function limpiarDespachosMock() {
  despachosRecibidos.clear();
}

/**
 * Retorna la lista de id_despacho recibidos hasta el momento.
 */
function obtenerDespachosMock() {
  return Array.from(despachosRecibidos);
}

/**
 * Controlador de recepción de órdenes en el servicio mock LIS/RIS
 */
async function procesarRecepcionMock(req, res) {
  // 1. Simulación de lentitud / timeout (si X-Mock-Lento es 'true' o '1', espera 15s)
  const mockLento = req.headers['x-mock-lento'];
  if (mockLento === 'true' || mockLento === '1') {
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }

  // 2. Simulación de fallo 500 interno del servicio externo
  const mockFallo = req.headers['x-mock-fallo'];
  if (mockFallo === 'true' || mockFallo === '1') {
    return res.status(500).json({
      ok: false,
      error: 'Error interno simulado del LIS'
    });
  }

  // 3. Verificación de Idempotencia (header Idempotency-Key o campo en body)
  const idDespacho = req.headers['idempotency-key'] || (req.body && req.body.id_despacho);

  if (idDespacho && despachosRecibidos.has(String(idDespacho))) {
    return res.status(200).json({
      ok: true,
      duplicado: true,
      mensaje: 'Orden ya recibida previamente (despacho duplicado descartado)'
    });
  }

  // 4. Validación de reglas clínicas de rechazo (HIS-E-02)
  // Si algún ítem CUPS termina en '9' (o si el body contiene el código de prueba 903849 o similar)
  const items = (req.body && req.body.orden && Array.isArray(req.body.orden.items))
    ? req.body.orden.items
    : [];

  const itemRechazado = items.find((it) => {
    const cod = String(it.cups || it.codigo || '').trim();
    return cod.endsWith('9') || cod === '903849';
  });

  if (itemRechazado) {
    const cups = itemRechazado.cups || itemRechazado.codigo || '903849';
    return res.status(422).json({
      ok: false,
      codigo: 'E-422',
      mensaje: `CUPS ${cups} requiere ayuno registrado`
    });
  }

  // Fallback si viene 903849 en alguna parte del body
  const bodyStr = JSON.stringify(req.body || {});
  if (bodyStr.includes('903849')) {
    return res.status(422).json({
      ok: false,
      codigo: 'E-422',
      mensaje: 'CUPS 903849 requiere ayuno registrado'
    });
  }

  // 5. Registro de despacho exitoso
  if (idDespacho) {
    despachosRecibidos.add(String(idDespacho));
  }

  return res.status(200).json({
    ok: true,
    mensaje: 'Orden recibida y encolada en LIS'
  });
}

// Rutas mock para LIS y RIS
router.post('/mock/lis', procesarRecepcionMock);
router.post('/mock/ris', procesarRecepcionMock);

// Exportar router y helpers
router.limpiarDespachosMock = limpiarDespachosMock;
router.obtenerDespachosMock = obtenerDespachosMock;

module.exports = router;
