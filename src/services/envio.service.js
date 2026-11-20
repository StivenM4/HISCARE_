// src/services/envio.service.js — Servicio de despacho de órdenes a sistemas externos LIS/RIS, reintentos y reenvío (C.23)
const db = require('../db');
const { NoEncontrado, Conflicto } = require('../db/errores');

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

/**
 * Valida si algún procedimiento CUPS de la orden requiere consentimiento informado,
 * y en tal caso, verifica que exista un consentimiento médico firmado para la atención.
 * Si requiere consentimiento y no está firmado, arroja un error descriptivo para marcar
 * la integración en estado ERROR.
 *
 * @param {string} ordenId UUID de la orden diagnóstica
 * @param {object} [client] Cliente de base de datos o transacción opcional
 * @returns {Promise<boolean>} Retorna true si es válido
 */
async function validarConsentimiento(ordenId, client = null) {
  const executor = client || db;

  const { rows } = await executor.query(
    `SELECT EXISTS (
       SELECT 1
       FROM detalle_orden d
       JOIN procedimientos_cups c ON c.id = d.cups_id
       WHERE d.orden_id = $1 AND c.requiere_consentimiento = true
     ) AS requiere,
     (
       SELECT atencion_id FROM ordenes_diagnosticas WHERE id = $1
     ) AS atencion_id`,
    [ordenId]
  );

  if (!rows.length || !rows[0].requiere) {
    return true;
  }

  const atencionId = rows[0].atencion_id;
  if (!atencionId) return true;

  const { rows: rowsFirmado } = await executor.query(
    `SELECT EXISTS (
       SELECT 1 FROM consentimientos_medicos
       WHERE atencion_id = $1 AND firmado = true
     ) AS firmado`,
    [atencionId]
  );

  if (!rowsFirmado.length || !rowsFirmado[0].firmado) {
    const error = new Error('Requiere consentimiento informado firmado previo al despacho');
    error.codigo = 'CONSENTIMIENTO_PENDIENTE';
    error.status = 409;
    throw error;
  }

  return true;
}

/**
 * Obtiene los datos de la orden, atención, paciente e ítems para construir el payload
 * estándar de despacho a los sistemas LIS/RIS.
 *
 * @param {string} ordenId UUID de la orden
 * @param {string} idDespacho UUID de idempotencia del despacho
 * @param {object} [client] Cliente de base de datos opcional
 * @returns {Promise<object>} Estructura del payload
 */
async function armarPayload(ordenId, idDespacho, client = null) {
  const executor = client || db;

  const { rows } = await executor.query(
    `SELECT o.id, o.codigo, o.tipo, o.fecha,
            p.tipo_documento, p.numero_documento, p.nombres, p.apellidos,
            p.fecha_nacimiento, p.sexo
     FROM ordenes_diagnosticas o
     JOIN atenciones a ON a.id = o.atencion_id
     JOIN historias_clinicas h ON h.id = a.historia_id
     JOIN pacientes p ON p.id = h.paciente_id
     WHERE o.id = $1`,
    [ordenId]
  );

  if (!rows.length) {
    throw new NoEncontrado('Orden diagnóstica no encontrada');
  }

  const orden = rows[0];

  const { rows: items } = await executor.query(
    `SELECT c.codigo AS cups, c.descripcion, d.cantidad
     FROM detalle_orden d
     JOIN procedimientos_cups c ON c.id = d.cups_id
     WHERE d.orden_id = $1
     ORDER BY c.codigo ASC`,
    [ordenId]
  );

  const nombrePaciente = `${orden.nombres || ''} ${orden.apellidos || ''}`.trim();

  return {
    id_despacho: idDespacho,
    orden: {
      codigo: orden.codigo,
      tipo: orden.tipo,
      fecha: orden.fecha,
      paciente: {
        tipo_documento: orden.tipo_documento,
        numero_documento: orden.numero_documento,
        nombre: nombrePaciente,
        fecha_nacimiento: orden.fecha_nacimiento,
        sexo: orden.sexo,
      },
      items: items.map((it) => ({
        cups: it.cups,
        descripcion: it.descripcion,
        cantidad: parseInt(it.cantidad, 10) || 1,
      })),
    },
  };
}

/**
 * Realiza el envío de una orden al sistema externo (LIS o RIS).
 * Sigue el patrón:
 * 1) Validación previa y armado de payload.
 * 2) HTTP Fetch fuera de transacción (timeout 10s, sin retener conexiones).
 * 3) Update TX2 (< 5ms): transacción corta que actualiza estado, orden y notificaciones de alerta.
 *
 * @param {object} integracion Registro de la tabla integraciones
 * @param {object} [client] Cliente de base de datos opcional (si se suministra, se ejecutan las consultas sobre él)
 * @param {object} [ctx] Contexto de auditoría
 * @returns {Promise<object>} Resultado del proceso de envío
 */
async function enviar(integracion, client = null, ctx = null) {
  const executor = client || db;
  const txCtx = ctx || { usuarioId: '', ip: '127.0.0.1' };

  // Función auxiliar para ejecutar el bloque de actualización en una transacción corta (< 5ms)
  const ejecutarTx2 = async (fnUpdate) => {
    if (client) {
      return fnUpdate(client);
    }
    return db.tx(txCtx, fnUpdate);
  };

  // Si la integración no viene completa (por ejemplo solo trae id), cargar datos completos
  let reg = integracion;
  if (!reg.orden_id || !reg.id_despacho || reg.intentos === undefined) {
    const { rows: datosInt } = await executor.query(
      `SELECT i.*, o.codigo AS orden_codigo
       FROM integraciones i
       JOIN ordenes_diagnosticas o ON o.id = i.orden_id
       WHERE i.id = $1`,
      [reg.id]
    );
    if (!datosInt.length) {
      throw new NoEncontrado('Integración no encontrada');
    }
    reg = datosInt[0];
  }

  // 1. Validación de consentimiento informado
  try {
    await validarConsentimiento(reg.orden_id, executor);
  } catch (errConsent) {
    const motivoError = errConsent.message || 'Requiere consentimiento informado firmado previo al despacho';
    await ejecutarTx2(async (c) => {
      await c.query(
        `UPDATE integraciones
         SET estado_envio = 'ERROR',
             respuesta = $1,
             intentos = intentos + 1,
             fecha_modificacion = now()
         WHERE id = $2`,
        [motivoError, reg.id]
      );
    });
    return {
      ok: false,
      estado_envio: 'ERROR',
      error: motivoError,
    };
  }

  // 2. Obtención de URL de destino
  const port = process.env.PORT || 3000;
  const fallbackUrl = `http://127.0.0.1:${port}/mock/lis`;
  const sistema = String(reg.sistema || '').toUpperCase();
  let urlDestino = fallbackUrl;
  if (sistema.includes('RIS')) {
    urlDestino = (process.env.RIS_URL && process.env.RIS_URL !== 'undefined') ? process.env.RIS_URL : fallbackUrl;
  } else {
    urlDestino = (process.env.LIS_URL && process.env.LIS_URL !== 'undefined') ? process.env.LIS_URL : fallbackUrl;
  }

  // 3. Construcción del payload
  const payload = await armarPayload(reg.orden_id, reg.id_despacho, executor);

  // 4. HTTP Fetch fuera de transacción con timeout de 10 segundos e Idempotency-Key
  let respuestaHttp;
  let bodyTexto = '';
  let errorRed = null;

  try {
    respuestaHttp = await fetch(urlDestino, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': String(reg.id_despacho),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    bodyTexto = await respuestaHttp.text();
  } catch (err) {
    errorRed = err;
  }

  // 5. Update TX2 (< 5ms): actualización atómica del resultado
  // 5.1 Éxito: 200 o 201
  if (!errorRed && (respuestaHttp.status === 200 || respuestaHttp.status === 201)) {
    await ejecutarTx2(async (c) => {
      await c.query(
        `UPDATE integraciones
         SET estado_envio = 'ENVIADO',
             fecha_envio = now(),
             respuesta = $1,
             intentos = intentos + 1,
             fecha_modificacion = now()
         WHERE id = $2`,
        [bodyTexto, reg.id]
      );

      await c.query(
        `UPDATE ordenes_diagnosticas
         SET estado = 'EN_PROCESO',
             fecha_modificacion = now()
         WHERE id = $1 AND estado = 'PENDIENTE'`,
        [reg.orden_id]
      );
    });

    return {
      ok: true,
      estado_envio: 'ENVIADO',
      respuesta: bodyTexto,
      status: respuestaHttp.status,
    };
  }

  // 5.2 Rechazo del destino: 4xx (HIS-E-02, no reintenta automáticamente)
  if (!errorRed && respuestaHttp.status >= 400 && respuestaHttp.status < 500) {
    await ejecutarTx2(async (c) => {
      await c.query(
        `UPDATE integraciones
         SET estado_envio = 'ERROR',
             respuesta = $1,
             intentos = intentos + 1,
             fecha_modificacion = now()
         WHERE id = $2`,
        [bodyTexto, reg.id]
      );
    });

    return {
      ok: false,
      estado_envio: 'ERROR',
      status: respuestaHttp.status,
      respuesta: bodyTexto,
    };
  }

  // 5.3 Timeout, 5xx o fallo de red: política de reintentos (1, 5, 15 min)
  const nuevoIntentos = (parseInt(reg.intentos, 10) || 0) + 1;
  let errorMsg = '';
  if (errorRed) {
    if (errorRed.name === 'TimeoutError' || errorRed.name === 'AbortError') {
      errorMsg = `Timeout en comunicación con ${reg.sistema || 'sistema externo'}`;
    } else {
      errorMsg = errorRed.message || 'Error de red';
    }
  } else {
    errorMsg = bodyTexto || `Error HTTP ${respuestaHttp.status}`;
  }

  if (nuevoIntentos < 3) {
    const minutosArray = [1, 5, 15];
    const minutos = minutosArray[nuevoIntentos - 1] || 15;

    await ejecutarTx2(async (c) => {
      await c.query(
        `UPDATE integraciones
         SET estado_envio = 'REINTENTO',
             intentos = $1,
             proximo_intento = now() + ($2 || ' minutes')::interval,
             respuesta = $3,
             fecha_modificacion = now()
         WHERE id = $4`,
        [nuevoIntentos, String(minutos), errorMsg, reg.id]
      );
    });

    return {
      ok: false,
      estado_envio: 'REINTENTO',
      intentos: nuevoIntentos,
      proximo_intento_minutos: minutos,
      error: errorMsg,
    };
  }

  // Tercer fallo o superior: pasa a ERROR y notifica a administradores (HIS-E-01)
  await ejecutarTx2(async (c) => {
    await c.query(
      `UPDATE integraciones
       SET estado_envio = 'ERROR',
           intentos = $1,
           respuesta = $2,
           fecha_modificacion = now()
       WHERE id = $3`,
      [nuevoIntentos, errorMsg, reg.id]
    );

    let codigoOrden = reg.orden_codigo;
    if (!codigoOrden) {
      const { rows: oRows } = await c.query(
        'SELECT codigo FROM ordenes_diagnosticas WHERE id = $1',
        [reg.orden_id]
      );
      codigoOrden = oRows.length ? oRows[0].codigo : reg.orden_id;
    }

    const sistemaNombre = reg.sistema || 'LIS';
    const mensajeNotif = `Fallo crítico en despacho de orden ${codigoOrden} a ${sistemaNombre} tras 3 intentos. Verifique el servicio externo.`;

    await c.query(
      `INSERT INTO notificaciones (usuario_id, mensaje, prioridad)
       SELECT u.id, $1, 'CRITICA'
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE r.nombre = 'ADMINISTRADOR' AND u.activo = true`,
      [mensajeNotif]
    );
  });

  return {
    ok: false,
    estado_envio: 'ERROR',
    intentos: nuevoIntentos,
    error: errorMsg,
    notificado_admin: true,
  };
}

/**
 * Reenvío manual de una orden que quedó en estado ERROR (solo para perfil ADMINISTRADOR).
 * Restablece estado a PENDIENTE, intentos a 0 y proximo_intento a now() manteniendo
 * el mismo id_despacho (HIS-E-03).
 *
 * @param {string} integracionId UUID de la integración
 * @param {object} ctx Contexto de auditoría
 * @returns {Promise<object>} Registro actualizado
 */
async function reenviar(integracionId, ctx) {
  return await db.tx(ctx, async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM integraciones WHERE id = $1 FOR UPDATE`,
      [integracionId]
    );

    if (!rows.length) {
      throw new NoEncontrado('Integración no encontrada');
    }

    const integracion = rows[0];
    if (integracion.estado_envio !== 'ERROR') {
      throw new Conflicto(
        `Solo se pueden reenviar órdenes en estado ERROR (estado actual: ${integracion.estado_envio})`
      );
    }

    const { rows: actualizadas } = await client.query(
      `UPDATE integraciones
       SET estado_envio = 'PENDIENTE',
           intentos = 0,
           proximo_intento = now(),
           fecha_modificacion = now()
       WHERE id = $1 AND estado_envio = 'ERROR'
       RETURNING *`,
      [integracionId]
    );

    return actualizadas[0];
  });
}

/**
 * Obtiene el resumen de conteos agrupado por estado de envío.
 * @returns {Promise<{ ENVIADO: number, PENDIENTE: number, REINTENTO: number, ERROR: number }>}
 */
async function obtenerResumen() {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE estado_envio = 'ENVIADO')::integer AS "ENVIADO",
       COUNT(*) FILTER (WHERE estado_envio = 'PENDIENTE')::integer AS "PENDIENTE",
       COUNT(*) FILTER (WHERE estado_envio = 'REINTENTO')::integer AS "REINTENTO",
       COUNT(*) FILTER (WHERE estado_envio = 'ERROR')::integer AS "ERROR"
     FROM integraciones`
  );

  const r = rows[0] || {};
  return {
    ENVIADO: r.ENVIADO || 0,
    PENDIENTE: r.PENDIENTE || 0,
    REINTENTO: r.REINTENTO || 0,
    ERROR: r.ERROR || 0,
  };
}

/**
 * Lista integraciones de despacho con paginación y filtros opcionales.
 *
 * @param {object} opciones Filtros { estado, orden, page, limite }
 * @returns {Promise<{ filas: Array, total: number, page: number, limite: number, totalPaginas: number }>}
 */
async function listarIntegraciones({ estado, orden, page = 1, limite = 20 } = {}) {
  const condiciones = [];
  const valores = [];

  if (estado && typeof estado === 'string' && estado.trim()) {
    valores.push(estado.trim().toUpperCase());
    condiciones.push(`i.estado_envio = $${valores.length}`);
  }

  if (orden && typeof orden === 'string' && orden.trim()) {
    const ordTrim = orden.trim();
    valores.push(ordTrim);
    const idx = valores.length;
    condiciones.push(`(
      (CASE WHEN $${idx} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN i.orden_id = $${idx}::uuid OR i.id = $${idx}::uuid ELSE false END)
      OR o.codigo ILIKE '%' || $${idx} || '%'
    )`);
  }

  const whereClausula = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimite = Math.max(1, parseInt(limite, 10) || 20);
  const offset = (numPage - 1) * numLimite;

  const countSql = `
    SELECT COUNT(*)::integer AS total
    FROM integraciones i
    JOIN ordenes_diagnosticas o ON o.id = i.orden_id
    ${whereClausula}
  `;
  const { rows: countRows } = await db.query(countSql, valores);
  const total = countRows[0]?.total || 0;

  const valoresData = [...valores];
  valoresData.push(numLimite);
  const limitIdx = valoresData.length;
  valoresData.push(offset);
  const offsetIdx = valoresData.length;

  const sqlData = `
    SELECT i.id,
           i.orden_id,
           o.codigo AS orden_codigo,
           o.tipo AS orden_tipo,
           TRIM(p.nombres || ' ' || p.apellidos) AS paciente,
           p.tipo_documento,
           p.numero_documento,
           i.sistema,
           i.id_despacho,
           i.estado_envio,
           i.intentos,
           i.fecha_envio,
           i.proximo_intento,
           i.respuesta,
           i.fecha_creacion,
           to_char(i.fecha_envio, 'DD/MM/YYYY HH24:MI:SS') AS fecha_envio_formateada,
           to_char(i.proximo_intento, 'DD/MM/YYYY HH24:MI:SS') AS proximo_intento_formateada
    FROM integraciones i
    JOIN ordenes_diagnosticas o ON o.id = i.orden_id
    JOIN atenciones a ON a.id = o.atencion_id
    JOIN historias_clinicas h ON h.id = a.historia_id
    JOIN pacientes p ON p.id = h.paciente_id
    ${whereClausula}
    ORDER BY
      CASE i.estado_envio
        WHEN 'REINTENTO' THEN 1
        WHEN 'PENDIENTE' THEN 2
        WHEN 'ERROR' THEN 3
        WHEN 'ENVIADO' THEN 4
        ELSE 5
      END,
      i.proximo_intento ASC NULLS LAST,
      i.fecha_creacion DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows: filas } = await db.query(sqlData, valoresData);
  return {
    filas,
    total,
    page: numPage,
    limite: numLimite,
    totalPaginas: Math.ceil(total / numLimite) || 1,
  };
}

/**
 * Obtiene el detalle completo de una integración para visualización o inspección.
 *
 * @param {string} id UUID de la integración
 * @returns {Promise<object>} Detalle con datos de orden, paciente e ítems
 */
async function obtenerDetalle(id) {
  if (!id || typeof id !== 'string') {
    throw new NoEncontrado('Integración no encontrada');
  }

  const sql = `
    SELECT i.id,
           i.orden_id,
           i.sistema,
           i.estado_envio,
           i.fecha_envio,
           i.respuesta,
           i.id_despacho,
           i.intentos,
           i.proximo_intento,
           i.fecha_creacion,
           i.fecha_modificacion,
           to_char(i.fecha_envio, 'DD/MM/YYYY HH24:MI:SS') AS fecha_envio_formateada,
           to_char(i.proximo_intento, 'DD/MM/YYYY HH24:MI:SS') AS proximo_intento_formateada,
           o.codigo AS orden_codigo,
           o.tipo AS orden_tipo,
           o.estado AS orden_estado,
           o.fecha AS orden_fecha,
           to_char(o.fecha, 'DD/MM/YYYY HH24:MI') AS orden_fecha_formateada,
           a.id AS atencion_id,
           p.id AS paciente_id,
           p.tipo_documento,
           p.numero_documento,
           p.nombres,
           p.apellidos,
           TRIM(p.nombres || ' ' || p.apellidos) AS paciente,
           p.fecha_nacimiento,
           p.sexo,
           u.id AS medico_id,
           u.nombre AS medico_nombre
    FROM integraciones i
    JOIN ordenes_diagnosticas o ON o.id = i.orden_id
    JOIN atenciones a ON a.id = o.atencion_id
    JOIN historias_clinicas h ON h.id = a.historia_id
    JOIN pacientes p ON p.id = h.paciente_id
    JOIN usuarios u ON u.id = a.medico_id
    WHERE (CASE WHEN $1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN i.id = $1::uuid ELSE false END)
  `;

  const { rows } = await db.query(sql, [id.trim()]);
  if (!rows.length) {
    throw new NoEncontrado('Integración no encontrada');
  }

  const reg = rows[0];

  const { rows: items } = await db.query(
    `SELECT c.codigo AS cups, c.codigo, c.descripcion, d.cantidad, c.requiere_consentimiento
     FROM detalle_orden d
     JOIN procedimientos_cups c ON c.id = d.cups_id
     WHERE d.orden_id = $1
     ORDER BY c.codigo ASC`,
    [reg.orden_id]
  );

  return {
    ...reg,
    orden: {
      id: reg.orden_id,
      codigo: reg.orden_codigo,
      tipo: reg.orden_tipo,
      estado: reg.orden_estado,
      fecha: reg.orden_fecha,
      fecha_formateada: reg.orden_fecha_formateada,
    },
    paciente: {
      id: reg.paciente_id,
      nombre: reg.paciente,
      nombres: reg.nombres,
      apellidos: reg.apellidos,
      tipo_documento: reg.tipo_documento,
      numero_documento: reg.numero_documento,
      fecha_nacimiento: reg.fecha_nacimiento,
      sexo: reg.sexo,
    },
    medico: {
      id: reg.medico_id,
      nombre: reg.medico_nombre,
    },
    items,
  };
}

module.exports = {
  validarConsentimiento,
  armarPayload,
  enviar,
  reenviar,
  obtenerResumen,
  listarIntegraciones,
  obtenerDetalle,
};
