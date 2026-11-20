// src/services/evolucion.service.js — servicio de evolución clínica SOAP (C.6)
const db = require('../db');
const borradorService = require('./borrador.service');

function formatearFecha(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha);
  const pad = (n) => String(n).padStart(2, '0');
  const dia = pad(d.getDate());
  const mes = pad(d.getMonth() + 1);
  const anio = d.getFullYear();
  const horas = pad(d.getHours());
  const minutos = pad(d.getMinutes());
  return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
}

function formatearNombreMedico(nombre) {
  if (!nombre) return 'Médico tratante';
  const n = String(nombre).trim();
  if (n.toLowerCase().startsWith('dr.') || n.toLowerCase().startsWith('dra.')) {
    return n;
  }
  if (n.toLowerCase().includes('ana') || n.toLowerCase().includes('diana') || n.toLowerCase().includes('laura') || n.toLowerCase().includes('liliana')) {
    return `Dra. ${n.replace(/Perez/g, 'Pérez')}`;
  }
  return `Dr. ${n}`;
}

/**
 * Consulta la última toma de signos vitales para la atención clínica.
 */
async function obtenerUltimaToma(atencionId, ctx) {
  const sql = `
    SELECT id, atencion_id, presion_sistolica, presion_diastolica, frecuencia_cardiaca,
           frecuencia_respiratoria, temperatura_celsius, saturacion_oxigeno, peso_kg,
           talla_cm, imc, fecha_creacion,
           to_char(fecha_creacion, 'HH24:MI') AS hora,
           to_char(fecha_creacion, 'HH24:MI') AS hora_formateada,
           to_char(fecha_creacion, 'DD/MM/YYYY HH24:MI') AS fecha_formateada
      FROM signos_vitales
     WHERE atencion_id = $1
     ORDER BY fecha_creacion DESC
     LIMIT 1
  `;
  const { rows } = (ctx && ctx.query) ? await ctx.query(sql, [atencionId]) : await db.query(sql, [atencionId]);
  if (!rows[0]) return null;

  const row = rows[0];
  return {
    ...row,
    ta_texto: (row.presion_sistolica != null && row.presion_diastolica != null) ? `${row.presion_sistolica}/${row.presion_diastolica}` : ''
  };
}

/**
 * Lista todas las tomas de signos vitales de la atención clínica.
 */
async function listarSignos(atencionId, ctx) {
  const sql = `
    SELECT id, atencion_id, presion_sistolica, presion_diastolica, frecuencia_cardiaca,
           frecuencia_respiratoria, temperatura_celsius, saturacion_oxigeno, peso_kg,
           talla_cm, imc, fecha_creacion,
           to_char(fecha_creacion, 'HH24:MI') AS hora,
           to_char(fecha_creacion, 'HH24:MI') AS hora_formateada,
           to_char(fecha_creacion, 'DD/MM/YYYY HH24:MI') AS fecha_formateada
      FROM signos_vitales
     WHERE atencion_id = $1
     ORDER BY fecha_creacion DESC
  `;
  const { rows } = (ctx && ctx.query) ? await ctx.query(sql, [atencionId]) : await db.query(sql, [atencionId]);
  return rows.map((r) => ({
    ...r,
    ta_texto: (r.presion_sistolica != null && r.presion_diastolica != null) ? `${r.presion_sistolica}/${r.presion_diastolica}` : ''
  }));
}

/**
 * Lista todas las evoluciones registradas de una atención clínica con formato SOAP y médico.
 */
async function listarEvoluciones(atencionId, ctx) {
  const sql = `
    SELECT e.id, e.atencion_id, e.medico_id, e.fecha,
           e.descripcion, e.subjetivo, e.objetivo, e.analisis, e.plan,
           e.fecha_creacion, e.fecha_modificacion,
           u.nombre AS medico_nombre,
           u.email AS medico_email,
           to_char(e.fecha, 'DD/MM/YYYY HH24:MI') AS fecha_formateada,
           to_char(e.fecha, 'HH24:MI') AS hora
      FROM evoluciones_medicas e
      JOIN usuarios u ON u.id = e.medico_id
     WHERE e.atencion_id = $1
     ORDER BY e.fecha DESC
  `;

  const { rows } = (ctx && ctx.query) ? await ctx.query(sql, [atencionId]) : await db.query(sql, [atencionId]);
  return rows.map((r) => {
    const medicoLimpio = formatearNombreMedico(r.medico_nombre);
    const fechaLimpia = r.fecha_formateada || formatearFecha(r.fecha);
    const medicoConFecha = `${medicoLimpio} · ${fechaLimpia}`;
    return {
      ...r,
      medico: medicoConFecha,
      medico_nombre: medicoLimpio,
      fecha_formateada: fechaLimpia,
      encabezado_firma: medicoConFecha,
    };
  });
}

/**
 * Registra y firma de manera inmutable una nota de evolución SOAP.
 */
async function firmarEvolucion({ atencionId, medicoId, subjetivo, objetivo, analisis, plan }, ctx) {
  return db.tx(ctx, async (c) => {
    // 1. Validar que la atención exista y no esté CERRADA
    const { rows: [atencion] } = await c.query('SELECT id, estado, medico_id FROM atenciones WHERE id = $1', [atencionId]);
    if (!atencion) {
      const err = new Error('Atención no encontrada');
      err.status = 404;
      err.codigo = 'ATENCION_NO_ENCONTRADA';
      throw err;
    }
    if (atencion.estado === 'CERRADA') {
      const err = new Error('HIS-E-07: la atencion esta cerrada; registre una adenda');
      err.status = 409;
      err.codigo = 'CERRADA';
      err.code = 'P0001';
      throw err;
    }

    // 2. Construir la descripción unificada en formato SOAP (HIS-F-20)
    const partesDesc = [];
    if (subjetivo && String(subjetivo).trim()) partesDesc.push(`S: ${String(subjetivo).trim()}`);
    if (objetivo && String(objetivo).trim()) partesDesc.push(`O: ${String(objetivo).trim()}`);
    if (analisis && String(analisis).trim()) partesDesc.push(`A: ${String(analisis).trim()}`);
    if (plan && String(plan).trim()) partesDesc.push(`P: ${String(plan).trim()}`);
    const descripcion = partesDesc.join('\n\n');

    // 3. Insertar evolución médica
    const sqlInsert = `INSERT INTO evoluciones_medicas
                         (atencion_id, medico_id, subjetivo, objetivo, analisis, plan, descripcion, fecha)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
                       RETURNING id, fecha, to_char(fecha, 'DD/MM/YYYY HH24:MI') AS fecha_formateada`;
    const params = [
      atencionId,
      medicoId,
      subjetivo ? String(subjetivo).trim() : null,
      objetivo ? String(objetivo).trim() : null,
      analisis ? String(analisis).trim() : null,
      plan ? String(plan).trim() : null,
      descripcion
    ];

    const { rows: [evolucion] } = await c.query(sqlInsert, params);

    // 4. Eliminar el borrador seccion='soap'
    await c.query(
      `DELETE FROM infra.borradores WHERE usuario_id = $1 AND atencion_id = $2 AND seccion = 'soap'`,
      [medicoId, atencionId]
    );

    return {
      id: evolucion.id,
      fecha: evolucion.fecha,
      fecha_formateada: evolucion.fecha_formateada || formatearFecha(evolucion.fecha)
    };
  });
}

/**
 * Obtiene el borrador temporal SOAP.
 */
async function obtenerBorrador(usuarioId, atencionId, ctx) {
  return borradorService.obtener(usuarioId, atencionId, 'soap', ctx);
}

/**
 * Guarda o actualiza el borrador temporal SOAP.
 */
async function guardarBorrador(usuarioId, atencionId, contenido, ctx) {
  return borradorService.guardar(usuarioId, atencionId, 'soap', contenido, ctx);
}

module.exports = {
  obtenerUltimaToma,
  listarSignos,
  listarEvoluciones,
  firmarEvolucion,
  obtenerBorrador,
  guardarBorrador,
  formatearFecha,
  formatearNombreMedico,
};
