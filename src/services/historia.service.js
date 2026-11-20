// src/services/historia.service.js — servicio de dominio para Historia Clínica Longitudinal (Pantalla C.9)
const db = require('../db');
const { ErrorValidacion, NoEncontrado } = require('../db/errores');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODOS_VALIDOS = ['1a', '5a', 'todo'];

/**
 * Busca al paciente y su historia clínica en historias_clinicas uniendo pacientes,
 * aseguradora/afiliación y antecedentes alérgicos.
 * Si existe, ejecuta dentro de db.tx(ctx, ...) el registro de auditoría
 * SELECT fn_auditar_consulta('historias_clinicas', historiaId) y retorna { paciente, historia }.
 * Si no existe historia o paciente, retorna null.
 *
 * @param {string} pacienteId - UUID del paciente
 * @param {object} [ctx] - Contexto de auditoría ({ usuarioId, ip })
 * @returns {Promise<object|null>} Objeto con { paciente, historia, ... }
 */
async function obtenerHistoriaPorPaciente(pacienteId, ctx = {}) {
  if (!pacienteId || !UUID_REGEX.test(pacienteId)) {
    return null;
  }

  const safeCtx = {
    usuarioId: (ctx && ctx.usuarioId) || '',
    ip: (ctx && ctx.ip) || '',
  };

  return db.tx(safeCtx, async (client) => {
    // 1. Buscar historia clínica y paciente asociado
    const { rows: rowsHC } = await client.query(
      `SELECT 
         hc.id AS historia_id,
         hc.paciente_id,
         to_char(hc.fecha_apertura, 'YYYY-MM-DD') AS fecha_apertura,
         hc.activo AS historia_activo,
         p.id,
         p.tipo_documento,
         p.numero_documento,
         p.tipo_documento || ' ' || p.numero_documento AS documento,
         p.nombres,
         p.apellidos,
         p.nombres || ' ' || p.apellidos AS paciente,
         p.nombres || ' ' || p.apellidos AS paciente_nombre,
         p.nombres || ' ' || p.apellidos AS nombre_completo,
         to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
         date_part('year', age(p.fecha_nacimiento))::int AS edad,
         p.sexo,
         p.telefono,
         p.direccion
       FROM historias_clinicas hc
       JOIN pacientes p ON p.id = hc.paciente_id
       WHERE p.id = $1`,
      [pacienteId]
    );

    if (rowsHC.length === 0) {
      return null;
    }

    const row = rowsHC[0];

    // 2. Registrar auditoría forense legal (SELECT_CONFIDENTIAL) sobre la historia clínica
    await client.query("SELECT fn_auditar_consulta('historias_clinicas', $1)", [row.historia_id]);

    // 3. Obtener EPS / Aseguradora vigente o más reciente
    const { rows: rowsAseguradora } = await client.query(
      `SELECT 
         s.nombre AS eps,
         s.nombre AS aseguradora,
         COALESCE(pa.tipo_usuario, s.tipo_plan) AS regimen,
         s.tipo_plan,
         pa.tipo_usuario
       FROM paciente_aseguradora pa
       JOIN aseguradoras s ON s.id = pa.aseguradora_id
       WHERE pa.paciente_id = $1 AND pa.activo AND s.activo
       ORDER BY (CURRENT_DATE BETWEEN pa.fecha_inicio AND pa.fecha_fin) DESC,
                pa.fecha_inicio DESC NULLS LAST
       LIMIT 1`,
      [pacienteId]
    );
    const epsRow = rowsAseguradora.length > 0 ? rowsAseguradora[0] : null;

    // 4. Obtener antecedentes alérgicos
    const { rows: rowsAlergias } = await client.query(
      `SELECT descripcion
       FROM antecedentes
       WHERE historia_id = $1 AND tipo = 'Alergico'
       ORDER BY fecha_creacion ASC`,
      [row.historia_id]
    );

    const listaAlergias = rowsAlergias.map((a) => a.descripcion).filter(Boolean);

    const historia = {
      id: row.historia_id,
      paciente_id: row.paciente_id,
      fecha_apertura: row.fecha_apertura,
      activo: row.historia_activo,
    };

    const paciente = {
      id: row.id,
      tipo_documento: row.tipo_documento,
      numero_documento: row.numero_documento,
      documento: row.documento,
      nombres: row.nombres,
      apellidos: row.apellidos,
      paciente: row.paciente,
      paciente_nombre: row.paciente_nombre,
      nombre_completo: row.nombre_completo,
      fecha_nacimiento: row.fecha_nacimiento,
      edad: row.edad,
      sexo: row.sexo,
      telefono: row.telefono,
      direccion: row.direccion,
      eps: epsRow ? epsRow.eps : 'Particular',
      aseguradora: epsRow ? epsRow.aseguradora : 'Particular',
      regimen: epsRow ? epsRow.regimen : 'Particular',
      tipo_plan: epsRow ? epsRow.tipo_plan : '',
      tipo_usuario: epsRow ? epsRow.tipo_usuario : '',
      alergias: listaAlergias,
      historia_id: row.historia_id,
      historia,
    };

    return {
      paciente,
      historia,
      historia_id: historia.id,
      paciente_id: paciente.id,
      fecha_apertura: historia.fecha_apertura,
      activo: historia.activo,
      documento: paciente.documento,
      tipo_documento: paciente.tipo_documento,
      numero_documento: paciente.numero_documento,
      nombres: paciente.nombres,
      apellidos: paciente.apellidos,
      paciente_nombre: paciente.nombre_completo,
      nombre_completo: paciente.nombre_completo,
      edad: paciente.edad,
      sexo: paciente.sexo,
      eps: paciente.eps,
      regimen: paciente.regimen,
      alergias: paciente.alergias,
    };
  });
}

/**
 * Obtiene la línea de tiempo cronológica unificada de atenciones, órdenes diagnósticas
 * y resultados diagnósticos para una historia clínica dada.
 * Valida periodo ∈ {'1a', '5a', 'todo'}. Calcula $desde de forma segura.
 * Ejecuta consulta unificada con CTE y límite de 200 hitos.
 *
 * @param {string} historiaId - UUID de la historia clínica
 * @param {string} [periodo='todo'] - Ventana temporal ('1a', '5a', 'todo')
 * @param {object} [ctx] - Contexto de auditoría opcional
 * @returns {Promise<Array<{ tipo: string, id: string, fecha: Date, titulo: string, subtitulo: string, estado: string|null, atencion_id: string }>>}
 */
async function obtenerTimeline(historiaId, periodo = 'todo', ctx) {
  if (!historiaId || !UUID_REGEX.test(historiaId)) {
    return [];
  }

  const p = (periodo || 'todo').toString().trim().toLowerCase();
  if (!PERIODOS_VALIDOS.includes(p)) {
    throw new ErrorValidacion("El periodo debe ser '1a', '5a' o 'todo'", ['periodo']);
  }

  const sql = `
    WITH a AS (
      SELECT 
        'ATENCION'::text AS tipo,
        a.id,
        a.fecha,
        'Atención · ' || u.nombre AS titulo,
        COALESCE(a.motivo_consulta, 'Consulta médica') AS subtitulo,
        a.estado::varchar AS estado,
        a.id AS atencion_id
      FROM atenciones a
      JOIN usuarios u ON u.id = a.medico_id
      WHERE a.historia_id = $1
    ),
    o AS (
      SELECT 
        'ORDEN'::text AS tipo,
        o.id,
        o.fecha,
        o.codigo || ' · ' || o.tipo AS titulo,
        COALESCE(
          (SELECT string_agg(pc.descripcion, ', ')
           FROM detalle_orden det
           JOIN procedimientos_cups pc ON pc.id = det.cups_id
           WHERE det.orden_id = o.id),
          o.sistema_destino,
          'Orden diagnóstica'
        ) AS subtitulo,
        o.estado::varchar AS estado,
        o.atencion_id
      FROM ordenes_diagnosticas o
      JOIN atenciones a ON a.id = o.atencion_id
      WHERE a.historia_id = $1
    ),
    r AS (
      SELECT 
        'RESULTADO'::text AS tipo,
        r.id,
        r.fecha_resultado AS fecha,
        'Resultado ' || r.tipo AS titulo,
        COALESCE(substring(r.informe from 1 for 120), 'Informe disponible') AS subtitulo,
        NULL::varchar AS estado,
        o.atencion_id
      FROM resultados_diagnosticos r
      JOIN ordenes_diagnosticas o ON o.id = r.orden_id
      JOIN atenciones a ON a.id = o.atencion_id
      WHERE a.historia_id = $1
    )
    SELECT * FROM (
      SELECT * FROM a
      UNION ALL
      SELECT * FROM o
      UNION ALL
      SELECT * FROM r
    ) t
    WHERE fecha >= CASE 
      WHEN $2 = '1a' THEN NOW() - INTERVAL '1 year'
      WHEN $2 = '5a' THEN NOW() - INTERVAL '5 years'
      ELSE TIMESTAMP '-infinity'
    END
    ORDER BY fecha DESC
    LIMIT 200;
  `;

  // Si se provee un contexto con usuarioId o ip, se puede auditar la consulta dentro de una transacción
  if (ctx && (ctx.usuarioId || ctx.ip)) {
    const safeCtx = { usuarioId: ctx.usuarioId || '', ip: ctx.ip || '' };
    return db.tx(safeCtx, async (client) => {
      await client.query("SELECT fn_auditar_consulta('historias_clinicas', $1)", [historiaId]);
      const { rows } = await client.query(sql, [historiaId, p]);
      return rows.map((row) => ({
        tipo: row.tipo,
        id: row.id,
        fecha: row.fecha,
        titulo: row.titulo,
        subtitulo: row.subtitulo,
        estado: row.estado,
        atencion_id: row.atencion_id,
      }));
    });
  }

  const { rows } = await db.query(sql, [historiaId, p]);

  return rows.map((row) => ({
    tipo: row.tipo,
    id: row.id,
    fecha: row.fecha,
    titulo: row.titulo,
    subtitulo: row.subtitulo,
    estado: row.estado,
    atencion_id: row.atencion_id,
  }));
}

/**
 * Ejecuta las 5 consultas paralelas del resumen de atención con el executor provisto (db o client de transacción).
 * @private
 */
async function _ejecutarResumenAtencion(executor, atencionId) {
  // 1) Atención + Médico + Especialidad
  const qAtencion = await executor.query(
    `SELECT 
       a.id,
       a.fecha,
       to_char(a.fecha, 'DD/MM/YYYY HH24:MI') AS fecha_formateada,
       a.motivo_consulta,
       a.estado,
       a.fecha_cierre,
       to_char(a.fecha_cierre, 'DD/MM/YYYY HH24:MI') AS fecha_cierre_formateada,
       a.historia_id,
       a.cita_id,
       u.id AS medico_id,
       u.nombre AS medico_nombre,
       u.email AS medico_email,
       COALESCE(
         (SELECT string_agg(e.nombre, ', ')
          FROM usuario_especialidad ue
          JOIN especialidades e ON e.id = ue.especialidad_id
          WHERE ue.usuario_id = u.id),
         'Medicina general'
       ) AS especialidad
     FROM atenciones a
     JOIN usuarios u ON u.id = a.medico_id
     WHERE a.id = $1`,
    [atencionId]
  );

  if (qAtencion.rows.length === 0) {
    return null;
  }

  // 2) Diagnósticos CIE-10 (Principal y Secundarios)
  const qDiagnosticos = await executor.query(
    `SELECT 
       da.id,
       da.tipo,
       dc.id AS cie10_id,
       dc.codigo,
       dc.descripcion
     FROM diagnosticos_atencion da
     JOIN diagnosticos_cie10 dc ON dc.id = da.cie10_id
     WHERE da.atencion_id = $1
     ORDER BY CASE WHEN da.tipo = 'PRINCIPAL' THEN 1 ELSE 2 END, dc.codigo ASC`,
    [atencionId]
  );

  // 3) Procedimientos CUPS
  const qProcedimientos = await executor.query(
    `SELECT 
       pa.id,
       pa.fecha,
       to_char(pa.fecha, 'DD/MM/YYYY') AS fecha_formateada,
       pc.id AS cups_id,
       pc.codigo,
       pc.descripcion,
       pc.requiere_consentimiento
     FROM procedimientos_atencion pa
     JOIN procedimientos_cups pc ON pc.id = pa.cups_id
     WHERE pa.atencion_id = $1
     ORDER BY pa.fecha ASC, pc.codigo ASC`,
    [atencionId]
  );

  // 4) Órdenes diagnósticas
  const qOrdenes = await executor.query(
    `SELECT 
       od.id,
       od.codigo,
       od.tipo,
       od.estado,
       od.sistema_destino,
       od.fecha,
       to_char(od.fecha, 'DD/MM/YYYY HH24:MI') AS fecha_formateada,
       od.atencion_id,
       COALESCE(
         (SELECT json_agg(json_build_object(
            'cups_id', pc.id,
            'codigo', pc.codigo,
            'descripcion', pc.descripcion,
            'cantidad', det.cantidad
          ))
          FROM detalle_orden det
          JOIN procedimientos_cups pc ON pc.id = det.cups_id
          WHERE det.orden_id = od.id),
         '[]'::json
       ) AS examenes
     FROM ordenes_diagnosticas od
     WHERE od.atencion_id = $1
     ORDER BY od.fecha DESC`,
    [atencionId]
  );

  // 5) Resultados diagnósticos asociados a las órdenes de la atención
  const qResultados = await executor.query(
    `SELECT 
       rd.id,
       rd.orden_id,
       od.codigo AS orden_codigo,
       rd.tipo,
       rd.informe,
       rd.archivo_url,
       rd.fecha_resultado,
       to_char(rd.fecha_resultado, 'DD/MM/YYYY HH24:MI') AS fecha_resultado_formateada,
       rd.usuario_carga,
       u.nombre AS usuario_carga_nombre,
       EXISTS (
         SELECT 1
           FROM notificaciones n
          WHERE n.resultado_id = rd.id
            AND n.leido = true
       ) AS revisado
     FROM resultados_diagnosticos rd
     JOIN ordenes_diagnosticas od ON od.id = rd.orden_id
     LEFT JOIN usuarios u ON u.id = rd.usuario_carga
     WHERE od.atencion_id = $1
     ORDER BY rd.fecha_resultado DESC`,
    [atencionId]
  );

  const atencionRow = qAtencion.rows[0];

  return {
    atencion: {
      id: atencionRow.id,
      fecha: atencionRow.fecha,
      fecha_formateada: atencionRow.fecha_formateada,
      motivo_consulta: atencionRow.motivo_consulta,
      estado: atencionRow.estado,
      fecha_cierre: atencionRow.fecha_cierre,
      fecha_cierre_formateada: atencionRow.fecha_cierre_formateada,
      historia_id: atencionRow.historia_id,
      cita_id: atencionRow.cita_id,
    },
    medico: {
      id: atencionRow.medico_id,
      nombre: atencionRow.medico_nombre,
      email: atencionRow.medico_email,
      especialidad: atencionRow.especialidad,
    },
    diagnosticos: qDiagnosticos.rows,
    procedimientos: qProcedimientos.rows,
    ordenes: qOrdenes.rows,
    resultados: qResultados.rows,
  };
}

/**
 * Obtiene el resumen clínico completo de una atención ejecutando 5 consultas paralelas:
 * 1) Atención + Médico + Especialidad
 * 2) Diagnósticos (CIE-10 principal y secundarios)
 * 3) Procedimientos CUPS
 * 4) Órdenes diagnósticas
 * 5) Resultados diagnósticos asociados a las órdenes de la atención
 *
 * @param {string} atencionId - UUID de la atención
 * @param {object} [ctx] - Contexto de auditoría opcional
 * @returns {Promise<{ atencion: object, medico: object, diagnosticos: Array, procedimientos: Array, ordenes: Array, resultados: Array }|null>}
 */
async function obtenerResumenAtencion(atencionId, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    return null;
  }

  if (ctx && (ctx.usuarioId || ctx.ip)) {
    const safeCtx = { usuarioId: ctx.usuarioId || '', ip: ctx.ip || '' };
    return db.tx(safeCtx, async (client) => {
      await client.query("SELECT fn_auditar_consulta('atenciones', $1)", [atencionId]);
      return _ejecutarResumenAtencion(client, atencionId);
    });
  }

  return _ejecutarResumenAtencion(db, atencionId);
}

/**
 * Consulta la información del paciente requerida para el banner institucional (_banner_paciente.ejs):
 * documento, edad, sexo, aseguradora y alergias registradas en antecedentes WHERE tipo='Alergico'.
 *
 * @param {string} pacienteId - UUID del paciente
 * @returns {Promise<object|null>}
 */
async function obtenerDatosPaciente(pacienteId) {
  if (!pacienteId || !UUID_REGEX.test(pacienteId)) {
    return null;
  }

  const { rows } = await db.query(
    `SELECT 
       p.id,
       p.tipo_documento,
       p.numero_documento,
       p.tipo_documento || ' ' || p.numero_documento AS documento,
       p.nombres,
       p.apellidos,
       p.nombres || ' ' || p.apellidos AS paciente,
       p.nombres || ' ' || p.apellidos AS nombre_completo,
       to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
       date_part('year', age(p.fecha_nacimiento))::int AS edad,
       p.sexo,
       p.telefono,
       p.direccion,
       hc.id AS historia_id
     FROM pacientes p
     LEFT JOIN historias_clinicas hc ON hc.paciente_id = p.id
     WHERE p.id = $1`,
    [pacienteId]
  );

  if (rows.length === 0) {
    return null;
  }

  const p = rows[0];

  // Afiliación y aseguradora
  const { rows: rowsAseguradora } = await db.query(
    `SELECT 
       s.nombre AS eps,
       s.nombre AS aseguradora,
       COALESCE(pa.tipo_usuario, s.tipo_plan) AS regimen,
       s.tipo_plan,
       pa.tipo_usuario
     FROM paciente_aseguradora pa
     JOIN aseguradoras s ON s.id = pa.aseguradora_id
     WHERE pa.paciente_id = $1 AND pa.activo AND s.activo
     ORDER BY (CURRENT_DATE BETWEEN pa.fecha_inicio AND pa.fecha_fin) DESC,
              pa.fecha_inicio DESC NULLS LAST
     LIMIT 1`,
    [pacienteId]
  );
  const epsRow = rowsAseguradora.length > 0 ? rowsAseguradora[0] : null;

  // Alergias registradas
  let listaAlergias = [];
  if (p.historia_id) {
    const { rows: rowsAlergias } = await db.query(
      `SELECT descripcion
       FROM antecedentes
       WHERE historia_id = $1 AND tipo = 'Alergico'
       ORDER BY fecha_creacion ASC`,
      [p.historia_id]
    );
    listaAlergias = rowsAlergias.map((a) => a.descripcion).filter(Boolean);
  }

  return {
    id: p.id,
    tipo_documento: p.tipo_documento,
    numero_documento: p.numero_documento,
    documento: p.documento,
    nombres: p.nombres,
    apellidos: p.apellidos,
    paciente: p.paciente,
    nombre_completo: p.nombre_completo,
    fecha_nacimiento: p.fecha_nacimiento,
    edad: p.edad,
    sexo: p.sexo,
    telefono: p.telefono,
    direccion: p.direccion,
    historia_id: p.historia_id,
    eps: epsRow ? epsRow.eps : 'Particular',
    aseguradora: epsRow ? epsRow.aseguradora : 'Particular',
    regimen: epsRow ? epsRow.regimen : 'Particular',
    tipo_plan: epsRow ? epsRow.tipo_plan : '',
    tipo_usuario: epsRow ? epsRow.tipo_usuario : '',
    alergias: listaAlergias,
  };
}

module.exports = {
  obtenerHistoriaPorPaciente,
  obtenerTimeline,
  obtenerResumenAtencion,
  obtenerDatosPaciente,
  UUID_REGEX,
  PERIODOS_VALIDOS,
};
