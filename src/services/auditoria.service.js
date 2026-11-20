// src/services/auditoria.service.js — servicio para bitácora de auditoría forense y reportes de control (C.26)
const db = require('../db');
const { ACCIONES_VALIDAS } = require('../validators/auditoria.validator');

/**
 * Tablas conocidas del dominio clínico y administrativo para poblar el filtro.
 */
const TABLAS_SISTEMA = [
  'adendas',
  'antecedentes',
  'aseguradoras',
  'atenciones',
  'citas',
  'consentimientos_medicos',
  'contactos_emergencia',
  'detalle_orden',
  'diagnosticos_atencion',
  'especialidades',
  'evoluciones_medicas',
  'historias_clinicas',
  'notas_alta',
  'notificaciones',
  'ordenes_diagnosticas',
  'paciente_aseguradora',
  'pacientes',
  'procedimientos_atencion',
  'resultados_diagnosticos',
  'signos_vitales',
  'usuario_especialidad',
  'usuarios',
];

/**
 * Formatea un resumen comprensible e inteligente del campo detalle para la tabla de eventos.
 */
function formatearResumen(detalle, accion, tabla) {
  if (!detalle) {
    return `${accion} en ${tabla}`;
  }

  if (typeof detalle === 'string') {
    const texto = detalle.trim();
    if (!texto.startsWith('{') && !texto.startsWith('[')) {
      return texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;
    }

    try {
      const obj = JSON.parse(texto);
      return formatearObjetoDetalle(obj, accion, tabla);
    } catch {
      return texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;
    }
  }

  if (typeof detalle === 'object') {
    return formatearObjetoDetalle(detalle, accion, tabla);
  }

  return `${accion} en ${tabla}`;
}

/**
 * Procesa el objeto JSON de auditoría (antes/después, filtros, etc.)
 */
function formatearObjetoDetalle(obj, accion, tabla) {
  if (!obj) return `${accion} en ${tabla}`;

  // Si es un objeto de filtros de consulta de auditoría
  if (obj.desde && obj.hasta) {
    return `Consulta de bitácora (${obj.desde} a ${obj.hasta})`;
  }

  const antes = obj.antes || null;
  const despues = obj.despues || null;

  // Manejo según acción
  if (accion === 'INSERT' && despues) {
    if (tabla === 'signos_vitales') {
      const ta = (despues.presion_sistolica && despues.presion_diastolica)
        ? `TA ${despues.presion_sistolica}/${despues.presion_diastolica}`
        : null;
      const fc = despues.frecuencia_cardiaca ? `FC ${despues.frecuencia_cardiaca}` : null;
      const fr = despues.frecuencia_respiratoria ? `FR ${despues.frecuencia_respiratoria}` : null;
      const temp = despues.temperatura_celsius ? `Temp ${despues.temperatura_celsius}°C` : null;
      const partes = [ta, fc, fr, temp].filter(Boolean);
      return partes.length > 0 ? partes.join(', ') : 'Signos vitales registrados';
    }

    if (tabla === 'citas') {
      const fechaStr = despues.fecha ? String(despues.fecha).replace('T', ' ').slice(0, 16) : '';
      return `Cita ${despues.estado || 'PROGRAMADA'} (${fechaStr})`;
    }

    if (tabla === 'atenciones') {
      return `Atención iniciada (${despues.tipo_atencion || 'CONSULTA_EXTERNA'}) - Estado: ${despues.estado || ''}`;
    }

    if (tabla === 'ordenes_diagnosticas') {
      return `Orden creada (${despues.codigo || ''}) - Tipo: ${despues.tipo || ''}`;
    }

    if (tabla === 'resultados_diagnosticos') {
      return `Resultado cargado para orden ${despues.orden_id ? despues.orden_id.slice(0, 8) : ''}`;
    }

    if (tabla === 'pacientes') {
      return `Paciente registrado: ${despues.primer_nombre || ''} ${despues.primer_apellido || ''} (${despues.numero_documento || ''})`;
    }

    if (tabla === 'usuarios') {
      return `Usuario registrado: ${despues.email || despues.nombre || ''}`;
    }

    // Caso genérico INSERT
    if (despues.codigo) return `Registro creado con código ${despues.codigo}`;
    if (despues.nombre) return `Registro creado: ${despues.nombre}`;
    if (despues.descripcion) return `Registro: ${despues.descripcion.slice(0, 60)}`;
    return `Inserción en ${tabla}`;
  }

  if (accion === 'UPDATE' && antes && despues) {
    // Si cambió el estado explícitamente
    if (antes.estado !== undefined && despues.estado !== undefined && antes.estado !== despues.estado) {
      return `${antes.estado} -> ${despues.estado}`;
    }

    // Detectar diferencias clave
    const cambios = [];
    const camposOmitidos = ['id', 'fecha_modificacion', 'updated_at', 'password_hash'];
    for (const clave of Object.keys(despues)) {
      if (camposOmitidos.includes(clave)) continue;
      if (JSON.stringify(antes[clave]) !== JSON.stringify(despues[clave])) {
        const valAntes = antes[clave] !== null && antes[clave] !== undefined ? String(antes[clave]) : 'null';
        const valDesp = despues[clave] !== null && despues[clave] !== undefined ? String(despues[clave]) : 'null';
        cambios.push(`${clave}: ${valAntes} -> ${valDesp}`);
      }
    }

    if (cambios.length > 0) {
      return cambios.slice(0, 2).join(', ') + (cambios.length > 2 ? '...' : '');
    }
    return `Actualización en ${tabla}`;
  }

  if (accion === 'DELETE') {
    const id = antes ? antes.id : '';
    return `Eliminación de registro (${id ? id.slice(0, 8) : ''})`;
  }

  if (accion === 'SELECT_CONFIDENTIAL') {
    return `Acceso a datos confidenciales en ${tabla}`;
  }

  if (accion === 'LOGIN') return 'Inicio de sesión exitoso';
  if (accion === 'LOGIN_FALLIDO') return 'Intento fallido de autenticación';
  if (accion === 'LOGOUT') return 'Cierre de sesión';
  if (accion === 'ACCESO_DENEGADO') return 'Intento de acceso denegado por permisos';

  return `${accion} en ${tabla}`;
}

/**
 * Normaliza las fechas desde y hasta para cubrir rangos completos.
 */
function normalizarRangoFechas(desde, hasta) {
  let desdeStr = desde.trim();
  let hastaStr = hasta.trim();

  // Si viene solo YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(desdeStr)) {
    desdeStr += ' 00:00:00';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(hastaStr)) {
    hastaStr += ' 23:59:59.999';
  }

  return { desdeStr, hastaStr };
}

/**
 * Consulta la bitácora de auditoría con keyset pagination y filtros.
 * Registra fn_auditar_consulta('auditoria', NULL, filtros) en cada llamada dentro de la transacción.
 */
async function consultar(filtros, ctx) {
  const { desde, hasta, usuario, accion, tabla, registro, cursor } = filtros;
  const { desdeStr, hastaStr } = normalizarRangoFechas(desde, hasta);

  let cursorFecha = null;
  let cursorId = null;

  if (cursor && typeof cursor === 'string' && cursor.trim()) {
    let rawCursor = cursor.trim();
    if (!rawCursor.includes('|')) {
      try {
        rawCursor = Buffer.from(rawCursor, 'base64').toString('utf8');
      } catch {
        rawCursor = '';
      }
    }
    const partes = rawCursor.split('|');
    if (partes.length >= 2) {
      cursorFecha = partes[0];
      cursorId = partes[1];
    }
  }

  return await db.tx(ctx, async (client) => {
    // 1. Registrar consulta de auditoría obligatoria (HIS-F-31, HIS-E-10)
    const filtrosAudit = {
      desde,
      hasta,
      usuario: usuario ? usuario.trim() : null,
      accion: accion ? accion.trim().toUpperCase() : null,
      tabla: tabla ? tabla.trim() : null,
      registro: registro ? registro.trim() : null,
      cursor: cursor || null,
    };
    await client.query("SELECT fn_auditar_consulta('auditoria', NULL, $1)", [JSON.stringify(filtrosAudit)]);

    // 2. Armar consulta con keyset pagination
    let sql = `
      SELECT a.id, a.fecha, a.usuario_id, u.email, u.nombre AS usuario_nombre,
             a.ip_origen, a.accion, a.tabla_afectada, a.registro_id, a.detalle
      FROM auditoria a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.fecha >= $1 AND a.fecha <= $2
    `;
    const params = [desdeStr, hastaStr];
    let idx = 3;

    if (usuario && usuario.trim()) {
      sql += ` AND a.usuario_id = $${idx++}`;
      params.push(usuario.trim());
    }
    if (accion && accion.trim()) {
      sql += ` AND a.accion = $${idx++}`;
      params.push(accion.trim().toUpperCase());
    }
    if (tabla && tabla.trim()) {
      sql += ` AND a.tabla_afectada = $${idx++}`;
      params.push(tabla.trim());
    }
    if (registro && registro.trim()) {
      sql += ` AND a.registro_id = $${idx++}`;
      params.push(registro.trim());
    }

    if (cursorFecha && cursorId) {
      sql += ` AND ((a.fecha < $${idx}) OR (a.fecha = $${idx} AND a.id < $${idx + 1}))`;
      params.push(cursorFecha, cursorId);
      idx += 2;
    }

    sql += ` ORDER BY a.fecha DESC, a.id DESC LIMIT 51`;

    const resultado = await client.query(sql, params);
    const rows = resultado.rows;

    const tieneMas = rows.length > 50;
    const filasRetorno = tieneMas ? rows.slice(0, 50) : rows;

    let siguiente = null;
    if (tieneMas && filasRetorno.length > 0) {
      const ultima = filasRetorno[filasRetorno.length - 1];
      const isoFecha = new Date(ultima.fecha).toISOString();
      siguiente = Buffer.from(`${isoFecha}|${ultima.id}`).toString('base64');
    }

    const filas = filasRetorno.map((r) => {
      const usuarioLogin = r.email ? r.email.split('@')[0] : (r.usuario_nombre || 'sistema');
      return {
        id: r.id,
        fecha: r.fecha ? new Date(r.fecha).toISOString() : null,
        usuario: usuarioLogin,
        usuario_nombre: r.usuario_nombre || 'Sistema',
        usuario_email: r.email || '',
        ip_origen: r.ip_origen ? String(r.ip_origen) : '-',
        accion: r.accion,
        tabla_afectada: r.tabla_afectada,
        registro_id: r.registro_id,
        resumen: formatearResumen(r.detalle, r.accion, r.tabla_afectada),
      };
    });

    return { filas, siguiente };
  });
}

/**
 * Obtiene el registro detallado de auditoría por UUID.
 */
async function obtenerDetalle(id, ctx) {
  const sql = `
    SELECT a.id, a.fecha, a.usuario_id, u.email, u.nombre AS usuario_nombre,
           a.ip_origen, a.accion, a.tabla_afectada, a.registro_id, a.detalle
    FROM auditoria a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.id = $1
  `;
  const res = await db.query(sql, [id]);
  if (!res.rows || res.rows.length === 0) {
    return null;
  }

  const r = res.rows[0];
  let detalleParsed = r.detalle;
  if (typeof r.detalle === 'string') {
    try {
      detalleParsed = JSON.parse(r.detalle);
    } catch {
      detalleParsed = r.detalle;
    }
  }

  const usuarioLogin = r.email ? r.email.split('@')[0] : (r.usuario_nombre || 'sistema');

  return {
    id: r.id,
    fecha: r.fecha ? new Date(r.fecha).toISOString() : null,
    usuario_id: r.usuario_id,
    usuario: usuarioLogin,
    usuario_nombre: r.usuario_nombre || 'Sistema',
    usuario_email: r.email || '',
    ip_origen: r.ip_origen ? String(r.ip_origen) : '-',
    accion: r.accion,
    tabla_afectada: r.tabla_afectada,
    registro_id: r.registro_id,
    detalle: detalleParsed,
    resumen: formatearResumen(r.detalle, r.accion, r.tabla_afectada),
  };
}

/**
 * Genera el resumen métrico de la bitácora para el periodo y filtros indicados.
 */
async function resumen(filtros, ctx) {
  const { desde, hasta, usuario, accion, tabla, registro } = filtros;
  const { desdeStr, hastaStr } = normalizarRangoFechas(desde, hasta);

  let sql = `
    SELECT count(*)::int as eventos,
           count(*) FILTER (WHERE a.tabla_afectada IN ('historias_clinicas','atenciones'))::int as accesoshc,
           count(*) FILTER (WHERE a.accion = 'SELECT_CONFIDENTIAL')::int as confidenciales,
           count(DISTINCT a.usuario_id)::int as usuarios
    FROM auditoria a
    WHERE a.fecha >= $1 AND a.fecha <= $2
  `;
  const params = [desdeStr, hastaStr];
  let idx = 3;

  if (usuario && usuario.trim()) {
    sql += ` AND a.usuario_id = $${idx++}`;
    params.push(usuario.trim());
  }
  if (accion && accion.trim()) {
    sql += ` AND a.accion = $${idx++}`;
    params.push(accion.trim().toUpperCase());
  }
  if (tabla && tabla.trim()) {
    sql += ` AND a.tabla_afectada = $${idx++}`;
    params.push(tabla.trim());
  }
  if (registro && registro.trim()) {
    sql += ` AND a.registro_id = $${idx++}`;
    params.push(registro.trim());
  }

  const res = await db.query(sql, params);
  const row = res.rows[0] || {};

  return {
    eventos: row.eventos || 0,
    accesosHC: row.accesoshc || 0,
    confidenciales: row.confidenciales || 0,
    usuarios: row.usuarios || 0,
  };
}

/**
 * Escapa valores para salida en formato CSV estándar (;).
 */
function escaparCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  const duplicado = str.replace(/"/g, '""');
  return `"${duplicado}"`;
}

/**
 * Exporta el resultado de la auditoría en formato CSV vía streaming o lotes de 1000.
 */
async function exportar(filtros, res, ctx) {
  const { desde, hasta, usuario, accion, tabla, registro } = filtros;
  const { desdeStr, hastaStr } = normalizarRangoFechas(desde, hasta);

  const ahora = new Date();
  const yyyy = ahora.getFullYear();
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  const dd = String(ahora.getDate()).padStart(2, '0');
  const hh = String(ahora.getHours()).padStart(2, '0');
  const min = String(ahora.getMinutes()).padStart(2, '0');
  const ss = String(ahora.getSeconds()).padStart(2, '0');
  const filename = `auditoria_${yyyy}${mm}${dd}_${hh}${min}${ss}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // UTF-8 BOM para compatibilidad con Excel
  res.write('\uFEFF');
  // Encabezados de columna
  res.write('Fecha y hora;Usuario;IP / equipo;Acción;Tabla afectada;Código registro;Detalle\r\n');

  await db.tx(ctx, async (client) => {
    // 1. Registrar auditoría de la consulta de exportación
    const filtrosExport = {
      desde,
      hasta,
      usuario: usuario ? usuario.trim() : null,
      accion: accion ? accion.trim().toUpperCase() : null,
      tabla: tabla ? tabla.trim() : null,
      registro: registro ? registro.trim() : null,
      exportacion: true,
    };
    await client.query("SELECT fn_auditar_consulta('auditoria', NULL, $1)", [JSON.stringify(filtrosExport)]);

    // 2. Consulta en lotes de 1000 con keyset pagination
    let cursorFecha = null;
    let cursorId = null;
    let continuar = true;

    while (continuar) {
      let sql = `
        SELECT a.id, a.fecha, a.usuario_id, u.email, u.nombre AS usuario_nombre,
               a.ip_origen, a.accion, a.tabla_afectada, a.registro_id, a.detalle
        FROM auditoria a
        LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.fecha >= $1 AND a.fecha <= $2
      `;
      const params = [desdeStr, hastaStr];
      let idx = 3;

      if (usuario && usuario.trim()) {
        sql += ` AND a.usuario_id = $${idx++}`;
        params.push(usuario.trim());
      }
      if (accion && accion.trim()) {
        sql += ` AND a.accion = $${idx++}`;
        params.push(accion.trim().toUpperCase());
      }
      if (tabla && tabla.trim()) {
        sql += ` AND a.tabla_afectada = $${idx++}`;
        params.push(tabla.trim());
      }
      if (registro && registro.trim()) {
        sql += ` AND a.registro_id = $${idx++}`;
        params.push(registro.trim());
      }

      if (cursorFecha && cursorId) {
        sql += ` AND ((a.fecha < $${idx}) OR (a.fecha = $${idx} AND a.id < $${idx + 1}))`;
        params.push(cursorFecha, cursorId);
        idx += 2;
      }

      sql += ` ORDER BY a.fecha DESC, a.id DESC LIMIT 1000`;

      const loteRes = await client.query(sql, params);
      const rows = loteRes.rows;

      for (const r of rows) {
        const fechaIso = r.fecha ? new Date(r.fecha).toISOString() : '';
        const usuarioLogin = r.email ? r.email.split('@')[0] : (r.usuario_nombre || 'sistema');
        const ip = r.ip_origen ? String(r.ip_origen) : '-';
        const acc = r.accion || '';
        const tbl = r.tabla_afectada || '';
        const reg = r.registro_id || '';
        const det = r.detalle || '';

        const linea = [
          escaparCsv(fechaIso),
          escaparCsv(usuarioLogin),
          escaparCsv(ip),
          escaparCsv(acc),
          escaparCsv(tbl),
          escaparCsv(reg),
          escaparCsv(det),
        ].join(';') + '\r\n';

        res.write(linea);
      }

      if (rows.length < 1000) {
        continuar = false;
      } else {
        const ultima = rows[rows.length - 1];
        cursorFecha = ultima.fecha;
        cursorId = ultima.id;
      }
    }
  });

  res.end();
}

/**
 * Obtiene los catálogos necesarios para los filtros de la vista.
 */
async function obtenerCatalogos() {
  const usuariosRes = await db.query(
    'SELECT id, nombre, email FROM usuarios WHERE activo = true ORDER BY nombre ASC'
  );

  const tablasRes = await db.query(
    'SELECT DISTINCT tabla_afectada FROM auditoria WHERE tabla_afectada IS NOT NULL ORDER BY tabla_afectada ASC'
  );

  const tablasExistentes = tablasRes.rows.map((r) => r.tabla_afectada);
  const conjuntoTablas = new Set([...TABLAS_SISTEMA, ...tablasExistentes]);
  const tablas = Array.from(conjuntoTablas).sort();

  return {
    usuarios: usuariosRes.rows,
    tablas,
    acciones: ACCIONES_VALIDAS,
  };
}

module.exports = {
  consultar,
  obtenerDetalle,
  resumen,
  exportar,
  obtenerCatalogos,
  formatearResumen,
};
