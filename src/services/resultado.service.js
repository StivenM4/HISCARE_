// src/services/resultado.service.js — Servicio para búsqueda de órdenes y resultados diagnósticos (C.24 y C.25)
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { Conflicto, NoEncontrado } = require('../db/errores');
const { obtenerUploadDir } = require('../config/entorno');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Busca una orden diagnóstica por su código legible (ej. ORD-89001) o por su UUID.
 * Incluye información del paciente, médico solicitante y lista de exámenes CUPS.
 *
 * @param {string} codigo - Código de la orden o UUID
 * @returns {Promise<Object|null>} Datos estructurados de la orden o null si no existe
 */
async function buscarOrdenPorCodigo(codigo) {
  if (!codigo || typeof codigo !== 'string' || !codigo.trim()) {
    return null;
  }

  const termino = codigo.trim();
  const esUuid = UUID_REGEX.test(termino);

  const sqlOrden = esUuid
    ? `SELECT
         o.id,
         o.codigo,
         o.tipo,
         o.estado,
         o.fecha,
         p.nombres AS paciente_nombres,
         p.apellidos AS paciente_apellidos,
         p.tipo_documento AS paciente_tipo_doc,
         p.numero_documento AS paciente_num_doc,
         u.nombre AS medico_nombre
       FROM ordenes_diagnosticas o
       JOIN atenciones a ON a.id = o.atencion_id
       JOIN historias_clinicas h ON h.id = a.historia_id
       JOIN pacientes p ON p.id = h.paciente_id
       JOIN usuarios u ON u.id = a.medico_id
       WHERE o.id = $1::uuid OR UPPER(o.codigo) = UPPER($2)
       LIMIT 1`
    : `SELECT
         o.id,
         o.codigo,
         o.tipo,
         o.estado,
         o.fecha,
         p.nombres AS paciente_nombres,
         p.apellidos AS paciente_apellidos,
         p.tipo_documento AS paciente_tipo_doc,
         p.numero_documento AS paciente_num_doc,
         u.nombre AS medico_nombre
       FROM ordenes_diagnosticas o
       JOIN atenciones a ON a.id = o.atencion_id
       JOIN historias_clinicas h ON h.id = a.historia_id
       JOIN pacientes p ON p.id = h.paciente_id
       JOIN usuarios u ON u.id = a.medico_id
       WHERE UPPER(o.codigo) = UPPER($1)
       LIMIT 1`;

  const params = esUuid ? [termino, termino] : [termino];
  const { rows } = await db.query(sqlOrden, params);
  if (!rows || rows.length === 0) {
    return null;
  }

  const orden = rows[0];

  // Obtener los procedimientos CUPS asociados en detalle_orden
  const { rows: examenes } = await db.query(
    `SELECT
       c.codigo AS cups,
       c.descripcion,
       det.cantidad
     FROM detalle_orden det
     JOIN procedimientos_cups c ON c.id = det.cups_id
     WHERE det.orden_id = $1
     ORDER BY c.codigo ASC`,
    [orden.id]
  );

  return {
    id: orden.id,
    codigo: orden.codigo,
    tipo: orden.tipo,
    estado: orden.estado,
    fecha: orden.fecha,
    paciente: {
      nombreCompleto: `${orden.paciente_nombres} ${orden.paciente_apellidos}`.trim(),
      documento: orden.paciente_num_doc,
      tipoDocumento: orden.paciente_tipo_doc,
    },
    medico: {
      nombre: orden.medico_nombre,
    },
    examenes: examenes.map((ex) => ({
      cups: ex.cups,
      descripcion: ex.descripcion,
      cantidad: ex.cantidad,
    })),
  };
}

/**
 * Registra el resultado diagnóstico de una orden en transacción segura.
 * Verifica reglas de negocio (estados PENDIENTE o EN_PROCESO) y delega
 * la actualización a COMPLETADA y la notificación a los triggers de BD.
 *
 * @param {Object} params
 * @param {string} params.ordenId - UUID de la orden diagnóstica
 * @param {string|null} params.informe - Texto del informe de resultados
 * @param {string|null} params.archivoUrl - Ruta relativa o URL del archivo adjunto
 * @param {Date|string} params.fechaResultado - Fecha de emisión del resultado
 * @param {string|null} params.usuarioId - UUID del usuario que carga el resultado
 * @param {string|null} params.ip - IP de origen para auditoría
 * @returns {Promise<{ id: string }>} Identificador del resultado creado
 */
async function guardarResultado({ ordenId, informe, archivoUrl, fechaResultado, usuarioId, ip }) {
  return await db.tx({ usuarioId, ip }, async (client) => {
    // 1. Verificar existencia y estado de la orden
    const { rows: ordenes } = await client.query(
      `SELECT id, tipo, estado
       FROM ordenes_diagnosticas
       WHERE id = $1
       FOR UPDATE`,
      [ordenId]
    );

    if (ordenes.length === 0) {
      throw new NoEncontrado('Orden diagnóstica no encontrada', 'ORDEN_NO_ENCONTRADA');
    }

    const orden = ordenes[0];

    if (orden.estado === 'CANCELADA') {
      throw new Conflicto('HIS-E-08: la orden está cancelada', 'ORDEN_CANCELADA');
    }

    if (orden.estado === 'COMPLETADA') {
      throw new Conflicto('La orden ya se encuentra completada', 'ORDEN_COMPLETADA');
    }

    // 2. Insertar en resultados_diagnosticos
    // NOTA: Los triggers trg_resultado_tipo y trg_resultado_notifica de PostgreSQL
    // actualizan automáticamente la orden a COMPLETADA y crean la notificación al médico.
    const { rows: resultadoRows } = await client.query(
      `INSERT INTO resultados_diagnosticos (orden_id, tipo, informe, archivo_url, fecha_resultado, usuario_carga)
       SELECT $1, o.tipo, $2, $3, $4, $5
       FROM ordenes_diagnosticas o
       WHERE o.id = $1
       RETURNING id, tipo, orden_id`,
      [ordenId, informe || null, archivoUrl || null, fechaResultado || new Date(), usuarioId || null]
    );

    return { id: resultadoRows[0].id };
  });
}

/**
 * Obtiene el detalle completo de un resultado diagnóstico para visualización clínica (C.25).
 * Registra auditoría forense de consulta sensible (SELECT_CONFIDENTIAL).
 *
 * @param {string} resultadoId - UUID del resultado diagnóstico
 * @param {Object} [ctx] - Contexto de auditoría { usuarioId, ip }
 * @returns {Promise<Object>} Detalle estructurado del resultado
 */
async function obtenerDetalleResultado(resultadoId, ctx) {
  if (!resultadoId || !UUID_REGEX.test(resultadoId)) {
    throw new NoEncontrado('Resultado diagnóstico no encontrado', 'RESULTADO_NO_ENCONTRADO');
  }

  return await db.tx(ctx, async (client) => {
    const { rows } = await client.query(
      `SELECT r.*,
              to_char(r.fecha_resultado, 'DD/MM/YYYY HH24:MI') as fecha_formateada,
              u.nombre as cargado_por,
              o.id as orden_id,
              o.codigo as orden_codigo,
              a.id as atencion_id,
              a.fecha as atencion_fecha,
              to_char(a.fecha, 'DD/MM/YYYY') as atencion_fecha_formateada,
              (d.codigo || ' ' || d.descripcion) as diagnostico,
              h.paciente_id
       FROM resultados_diagnosticos r
       JOIN ordenes_diagnosticas o ON o.id = r.orden_id
       JOIN atenciones a ON a.id = o.atencion_id
       JOIN historias_clinicas h ON h.id = a.historia_id
       LEFT JOIN usuarios u ON u.id = r.usuario_carga
       LEFT JOIN diagnosticos_atencion da ON da.atencion_id = a.id AND da.tipo = 'PRINCIPAL'
       LEFT JOIN diagnosticos_cie10 d ON d.id = da.cie10_id
       WHERE r.id = $1::uuid`,
      [resultadoId]
    );

    if (rows.length === 0) {
      throw new NoEncontrado('Resultado diagnóstico no encontrado', 'RESULTADO_NO_ENCONTRADO');
    }

    const resultado = rows[0];

    // Obtener los procedimientos CUPS asociados en detalle_orden si existen
    const { rows: examenes } = await client.query(
      `SELECT c.codigo AS cups,
              c.descripcion,
              det.cantidad
       FROM detalle_orden det
       JOIN procedimientos_cups c ON c.id = det.cups_id
       WHERE det.orden_id = $1
       ORDER BY c.codigo ASC`,
      [resultado.orden_id]
    );

    // Determinar el estado revisado (boolean) evaluando en la tabla notificaciones
    const usuarioId = (ctx && ctx.usuarioId) || null;
    const { rows: notifRows } = await client.query(
      `SELECT (
         EXISTS (SELECT 1 FROM notificaciones n WHERE n.resultado_id = $1 AND n.usuario_id = $2::uuid AND n.leido = true)
         OR (SELECT bool_or(n.leido) FROM notificaciones n WHERE n.resultado_id = $1) IS TRUE
       ) AS revisado`,
      [resultadoId, usuarioId]
    );

    const revisado = notifRows.length > 0 && Boolean(notifRows[0].revisado);

    // Auditoría forense en la misma conexión con contexto
    await client.query(
      "SELECT fn_auditar_consulta('resultados_diagnosticos', $1, 'Consulta de resultado C.25')",
      [resultadoId]
    );

    const examenPrincipal = examenes.length > 0
      ? examenes.map((e) => e.descripcion).join(', ')
      : 'Estudio diagnóstico';

    return {
      id: resultado.id,
      tipo: resultado.tipo,
      informe: resultado.informe,
      archivo_url: resultado.archivo_url,
      tiene_archivo: Boolean(resultado.archivo_url),
      fecha_resultado: resultado.fecha_resultado,
      fecha_formateada: resultado.fecha_formateada,
      cargado_por: resultado.cargado_por,
      orden_id: resultado.orden_id,
      orden_codigo: resultado.orden_codigo,
      atencion_id: resultado.atencion_id,
      atencion_fecha: resultado.atencion_fecha,
      atencion_fecha_formateada: resultado.atencion_fecha_formateada,
      diagnostico: resultado.diagnostico,
      paciente_id: resultado.paciente_id,
      examenes,
      examen_principal: examenPrincipal,
      revisado,
    };
  });
}

/**
 * Lista todos los resultados diagnósticos asociados al expediente de un paciente (C.25).
 *
 * @param {string} pacienteId - UUID del paciente
 * @param {Object} [ctx] - Contexto de auditoría { usuarioId, ip }
 * @returns {Promise<Array<Object>>} Lista de resultados ordenados cronológicamente
 */
async function listarResultadosPaciente(pacienteId, ctx) {
  if (!pacienteId || !UUID_REGEX.test(pacienteId)) {
    return [];
  }

  const usuarioId = (ctx && ctx.usuarioId) || null;

  return await db.tx(ctx, async (client) => {
    const { rows } = await client.query(
      `SELECT r.id,
              r.tipo,
              r.fecha_resultado,
              to_char(r.fecha_resultado, 'DD/MM/YYYY') as fecha_formateada,
              o.codigo as orden_codigo,
              o.id as orden_id,
              a.id as atencion_id,
              (r.archivo_url IS NOT NULL) as tiene_archivo,
              (EXISTS (SELECT 1 FROM notificaciones n WHERE n.resultado_id = r.id AND n.usuario_id = $2 AND n.leido = true)
               OR (SELECT bool_or(n.leido) FROM notificaciones n WHERE n.resultado_id = r.id) IS TRUE) as revisado
       FROM resultados_diagnosticos r
       JOIN ordenes_diagnosticas o ON o.id = r.orden_id
       JOIN atenciones a ON a.id = o.atencion_id
       JOIN historias_clinicas h ON h.id = a.historia_id
       WHERE h.paciente_id = $1::uuid
       ORDER BY r.fecha_resultado DESC, r.fecha_creacion DESC`,
      [pacienteId, usuarioId]
    );

    await client.query(
      "SELECT fn_auditar_consulta('pacientes', $1, 'Consulta lista de resultados C.25')",
      [pacienteId]
    );

    return rows.map((r) => ({
      ...r,
      revisado: Boolean(r.revisado),
      tiene_archivo: Boolean(r.tiene_archivo),
    }));
  });
}

/**
 * Obtiene la ruta física segura de un archivo adjunto validando permisos y evitando Path Traversal.
 * Registra auditoría forense de descarga/stream.
 *
 * @param {string} resultadoId - UUID del resultado diagnóstico
 * @param {Object} [ctx] - Contexto de auditoría { usuarioId, ip }
 * @returns {Promise<{ filePath: string, filename: string, mimeType: string }>}
 */
async function obtenerArchivoSeguro(resultadoId, ctx) {
  if (!resultadoId || !UUID_REGEX.test(resultadoId)) {
    throw new NoEncontrado('Resultado no encontrado', 'RESULTADO_NO_ENCONTRADO');
  }

  return await db.tx(ctx, async (client) => {
    const { rows } = await client.query(
      `SELECT id, archivo_url
       FROM resultados_diagnosticos
       WHERE id = $1`,
      [resultadoId]
    );

    if (rows.length === 0 || !rows[0].archivo_url) {
      throw new NoEncontrado('Archivo no encontrado para este resultado', 'ARCHIVO_NO_ENCONTRADO');
    }

    const resultado = rows[0];
    const uploadDir = obtenerUploadDir();
    const base = path.basename(resultado.archivo_url);
    const safePath = path.resolve(uploadDir, base);
    const rootSafe = path.resolve(uploadDir);

    if (!safePath.startsWith(rootSafe + path.sep) && safePath !== rootSafe) {
      throw new Error('Ruta de archivo no permitida (Path Traversal)');
    }

    if (!fs.existsSync(safePath)) {
      throw new NoEncontrado('El archivo físico no existe en el servidor', 'ARCHIVO_NO_ENCONTRADO');
    }

    const stat = fs.lstatSync(safePath);
    if (stat.isSymbolicLink()) {
      throw new Error('Ruta de archivo no permitida (Enlace simbólico detectado)');
    }

    const realPath = fs.realpathSync(safePath);
    const realRoot = fs.existsSync(rootSafe) ? fs.realpathSync(rootSafe) : rootSafe;
    if (!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) {
      throw new Error('Ruta de archivo no permitida (Path Traversal)');
    }

    await client.query(
      "SELECT fn_auditar_consulta('resultados_diagnosticos', $1, 'Descarga/Stream de archivo')",
      [resultadoId]
    );

    const ext = path.extname(base).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    return {
      filePath: realPath,
      filename: base,
      mimeType,
    };
  });
}

/**
 * Marca como revisadas las notificaciones asociadas al resultado diagnóstico
 * tanto para el usuario activo como para el médico solicitante de la atención.
 *
 * @param {string} resultadoId - UUID del resultado diagnóstico
 * @param {Object} [ctx] - Contexto de auditoría { usuarioId, ip }
 * @returns {Promise<{ actualizado: boolean }>}
 */
async function marcarRevisado(resultadoId, ctx) {
  if (!resultadoId || !UUID_REGEX.test(resultadoId)) {
    throw new NoEncontrado('Resultado no encontrado', 'RESULTADO_NO_ENCONTRADO');
  }

  const usuarioId = (ctx && ctx.usuarioId) || null;

  return await db.tx(ctx, async (client) => {
    const { rows } = await client.query(
      `UPDATE notificaciones SET leido = true
       WHERE resultado_id = $1::uuid AND (usuario_id = $2::uuid OR usuario_id IN (
         SELECT a.medico_id
         FROM resultados_diagnosticos r
         JOIN ordenes_diagnosticas o ON o.id = r.orden_id
         JOIN atenciones a ON a.id = o.atencion_id
         WHERE r.id = $1::uuid
       ))
       RETURNING id`,
      [resultadoId, usuarioId]
    );

    // Auditoría de la acción
    await client.query(
      "SELECT fn_auditar_consulta('resultados_diagnosticos', $1, 'Resultado marcado como revisado')",
      [resultadoId]
    );

    return { actualizado: rows.length > 0 };
  });
}

module.exports = {
  buscarOrdenPorCodigo,
  guardarResultado,
  obtenerDetalleResultado,
  listarResultadosPaciente,
  obtenerArchivoSeguro,
  marcarRevisado,
};

