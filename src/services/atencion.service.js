// src/services/atencion.service.js — inicio de atención (C.18) y pestaña Consulta (C.4)
const db = require('../db');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CAMPOS_SIGNOS = [
  'presion_sistolica',
  'presion_diastolica',
  'frecuencia_cardiaca',
  'frecuencia_respiratoria',
  'temperatura_celsius',
  'saturacion_oxigeno',
  'peso_kg',
  'talla_cm',
];

function extraerCampoCheck(constraint) {
  if (!constraint) return null;
  for (const c of CAMPOS_SIGNOS) {
    if (constraint.includes(c)) return c;
  }
  return null;
}

// Convierte una cita EN_SALA en atención; crea la historia clínica si es la primera (HIS-F-12)
async function iniciarDesdeCita(citaId, ctx) {
  if (!citaId || !UUID_REGEX.test(citaId)) {
    const e = new Error('Cita no encontrada');
    e.status = 404;
    throw e;
  }

  try {
    return await db.tx(ctx, async (c) => {
      const { rows: [cita] } = await c.query(
        'SELECT paciente_id, estado, medico_id FROM citas WHERE id = $1 FOR UPDATE',
        [citaId]
      );
      if (!cita) {
        const e = new Error('Cita no encontrada');
        e.status = 404;
        throw e;
      }
      if (cita.estado !== 'EN_SALA') {
        const e = new Error('La cita debe estar EN_SALA');
        e.status = 409;
        throw e;
      }
      if (cita.medico_id !== (ctx && ctx.usuarioId) && ctx?.rol !== 'ADMINISTRADOR') {
        const e = new Error('Solo el médico de la cita puede iniciarla');
        e.status = 403;
        throw e;
      }

      await c.query(
        'INSERT INTO historias_clinicas (paciente_id) VALUES ($1) ON CONFLICT (paciente_id) DO NOTHING',
        [cita.paciente_id]
      );
      const { rows: [h] } = await c.query(
        'SELECT id FROM historias_clinicas WHERE paciente_id = $1',
        [cita.paciente_id]
      );
      // trg_atenciones_cita valida la cita y la marca ATENDIDA: aquí no se toca la cita
      const { rows: [a] } = await c.query(
        'INSERT INTO atenciones (historia_id, medico_id, cita_id) VALUES ($1, $2, $3) RETURNING id',
        [h.id, cita.medico_id, citaId]
      );
      return { atencion_id: a.id };
    });
  } catch (err) {
    if (err.code === '23505') {
      const e = new Error('Ya existe una atención para esta cita');
      e.status = 409;
      e.codigo = 'DUPLICADO';
      throw e;
    }
    if (err.code === 'P0001') {
      const e = new Error(err.message || 'No se puede iniciar la atención desde esta cita');
      e.status = 409;
      e.codigo = 'REGLA_DE_NEGOCIO';
      throw e;
    }
    throw err;
  }
}

/**
 * Carga la atención completa con datos de paciente, EPS vigente, alergias,
 * tomas de signos vitales anteriores y borrador activo si existe.
 * Registra auditoría SELECT_CONFIDENTIAL.
 */
async function cargar(atencionId, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) return null;

  return db.tx(ctx, async (c) => {
    const { rows: [a] } = await c.query(
      `SELECT a.id, a.estado, a.medico_id, a.motivo_consulta, a.historia_id, a.cita_id,
              to_char(a.fecha, 'DD/MM/YYYY HH24:MI') AS fecha,
              a.fecha_cierre,
              to_char(a.fecha_cierre, 'DD/MM/YYYY HH24:MI:SS') AS fecha_cierre_formateada,
              a.firma_hash,
              um.nombre AS medico_nombre,
              p.id AS paciente_id,
              p.nombres, p.apellidos,
              p.nombres || ' ' || p.apellidos AS paciente,
              p.tipo_documento, p.numero_documento,
              p.tipo_documento || ' ' || p.numero_documento AS documento,
              p.fecha_nacimiento,
              p.sexo,
              date_part('year', age(p.fecha_nacimiento))::int AS edad,
              (SELECT s.nombre FROM paciente_aseguradora pa
                 JOIN aseguradoras s ON s.id = pa.aseguradora_id
                WHERE pa.paciente_id = p.id AND pa.activo AND s.activo
                  AND CURRENT_DATE BETWEEN pa.fecha_inicio AND pa.fecha_fin
                ORDER BY pa.fecha_inicio DESC LIMIT 1) AS eps,
              ARRAY(SELECT descripcion FROM antecedentes x
                     WHERE x.historia_id = h.id AND x.tipo = 'Alergico') AS alergias
         FROM atenciones a
         JOIN historias_clinicas h ON h.id = a.historia_id
         JOIN pacientes p ON p.id = h.paciente_id
         LEFT JOIN usuarios um ON um.id = a.medico_id
        WHERE a.id = $1`,
      [atencionId]
    );

    if (!a) return null;

    await c.query("SELECT fn_auditar_consulta('atenciones', $1)", [atencionId]);

    const { rows: tomas } = await c.query(
      `SELECT id, presion_sistolica, presion_diastolica, frecuencia_cardiaca, frecuencia_respiratoria,
              temperatura_celsius, saturacion_oxigeno, peso_kg, talla_cm, imc,
              to_char(fecha_creacion, 'HH24:MI') AS hora
         FROM signos_vitales
        WHERE atencion_id = $1
        ORDER BY fecha_creacion DESC`,
      [atencionId]
    );

    let borrador = null;
    if (ctx && ctx.usuarioId) {
      const { rows: [b] } = await c.query(
        `SELECT contenido, to_char(fecha, 'HH24:MI') AS hora, fecha
           FROM infra.borradores
          WHERE usuario_id = $1 AND atencion_id = $2 AND seccion = 'motivo'`,
        [ctx.usuarioId, atencionId]
      );
      if (b) borrador = b;
    }

    const textoBorrador = borrador && borrador.contenido
      ? (typeof borrador.contenido === 'string'
          ? borrador.contenido
          : (borrador.contenido.texto || borrador.contenido.motivo || ''))
      : '';

    const motivoConsulta = a.motivo_consulta || textoBorrador || '';

    return {
      ...a,
      motivo_consulta: motivoConsulta,
      paciente: a.paciente,
      documento: a.documento,
      edad: a.edad,
      sexo: a.sexo,
      eps: a.eps || null,
      alergias: a.alergias || [],
      tomas: tomas || [],
      borrador,
    };
  });
}

/**
 * Resumen clínico del paciente para banner de atención y vista previa.
 * Audita consulta sobre tabla 'pacientes'.
 */
async function resumenPaciente(pacienteId, ctx) {
  if (!pacienteId || !UUID_REGEX.test(pacienteId)) return null;

  return db.tx(ctx, async (c) => {
    const { rows: [p] } = await c.query(
      `SELECT p.id, p.nombres, p.apellidos,
              p.tipo_documento, p.numero_documento,
              p.tipo_documento || ' ' || p.numero_documento AS documento,
              p.fecha_nacimiento, p.sexo,
              date_part('year', age(p.fecha_nacimiento))::int AS edad,
              (SELECT s.nombre FROM paciente_aseguradora pa
                 JOIN aseguradoras s ON s.id = pa.aseguradora_id
                WHERE pa.paciente_id = p.id AND pa.activo AND s.activo
                  AND CURRENT_DATE BETWEEN pa.fecha_inicio AND pa.fecha_fin
                ORDER BY pa.fecha_inicio DESC LIMIT 1) AS eps,
              ARRAY(SELECT a.descripcion FROM antecedentes a
                     JOIN historias_clinicas h ON h.id = a.historia_id
                    WHERE h.paciente_id = p.id AND a.tipo = 'Alergico') AS alergias
         FROM pacientes p
        WHERE p.id = $1`,
      [pacienteId]
    );

    if (!p) return null;

    await c.query("SELECT fn_auditar_consulta('pacientes', $1)", [pacienteId]);

    return {
      id: p.id,
      nombre: `${p.nombres} ${p.apellidos}`.trim(),
      documento: p.documento,
      edad: p.edad,
      sexo: p.sexo,
      eps: p.eps || null,
      alergias: p.alergias || [],
    };
  });
}

/**
 * Guarda el motivo de consulta en una atención abierta y limpia el borrador.
 */
async function guardarMotivo(atencionId, motivo, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    const err = new Error('Atención no encontrada');
    err.status = 404;
    err.codigo = 'ATENCION_NO_ENCONTRADA';
    throw err;
  }

  return db.tx(ctx, async (c) => {
    const { rows: [a] } = await c.query('SELECT estado FROM atenciones WHERE id = $1', [atencionId]);
    if (!a) {
      const err = new Error('Atención no encontrada');
      err.status = 404;
      err.codigo = 'ATENCION_NO_ENCONTRADA';
      throw err;
    }
    if (a.estado === 'CERRADA') {
      const err = new Error('La atención está cerrada');
      err.status = 409;
      err.codigo = 'CERRADA';
      throw err;
    }

    const { rowCount } = await c.query(
      "UPDATE atenciones SET motivo_consulta = $1 WHERE id = $2 AND estado = 'ABIERTA'",
      [motivo, atencionId]
    );

    if (!rowCount) {
      const err = new Error('La atención está cerrada');
      err.status = 409;
      err.codigo = 'CERRADA';
      throw err;
    }

    if (ctx && ctx.usuarioId) {
      await c.query(
        "DELETE FROM infra.borradores WHERE usuario_id = $1 AND atencion_id = $2 AND seccion = 'motivo'",
        [ctx.usuarioId, atencionId]
      );
    } else {
      await c.query(
        "DELETE FROM infra.borradores WHERE atencion_id = $1 AND seccion = 'motivo'",
        [atencionId]
      );
    }

    return { ok: true };
  });
}

/**
 * Registra una toma de signos vitales para la atención.
 * - Valida que al menos un signo esté diligenciado.
 * - Convierte a Number o null (no envía imc, generado por BD).
 * - Traduce restricciones CHECK (23514) a 422 indicando el campo.
 * - Traduce trigger de atención cerrada (P0001) a 409.
 */
async function registrarSignos(atencionId, body, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    const err = new Error('Atención no encontrada');
    err.status = 404;
    err.codigo = 'ATENCION_NO_ENCONTRADA';
    throw err;
  }

  let haySigno = false;
  const valores = {};
  for (const k of CAMPOS_SIGNOS) {
    const val = body ? body[k] : undefined;
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const num = Number(val);
      if (!isNaN(num)) {
        valores[k] = num;
        haySigno = true;
      } else {
        valores[k] = null;
      }
    } else {
      valores[k] = null;
    }
  }

  if (!haySigno) {
    const err = new Error('Debe diligenciar al menos un signo vital');
    err.status = 422;
    err.codigo = 'VALIDACION_FALLIDA';
    throw err;
  }

  const valoresArray = CAMPOS_SIGNOS.map((k) => valores[k]);

  try {
    return await db.tx(ctx, async (c) => {
      const { rows: [a] } = await c.query('SELECT estado FROM atenciones WHERE id = $1', [atencionId]);
      if (!a) {
        const err = new Error('Atención no encontrada');
        err.status = 404;
        err.codigo = 'ATENCION_NO_ENCONTRADA';
        throw err;
      }
      if (a.estado === 'CERRADA') {
        const err = new Error('HIS-E-07: la atencion esta cerrada; registre una adenda');
        err.status = 409;
        err.codigo = 'CERRADA';
        throw err;
      }

      const { rows: [s] } = await c.query(
        `INSERT INTO signos_vitales (atencion_id, ${CAMPOS_SIGNOS.join(', ')})
         VALUES ($1, ${CAMPOS_SIGNOS.map((_, i) => '$' + (i + 2)).join(', ')})
         RETURNING id, imc`,
        [atencionId, ...valoresArray]
      );
      return s;
    });
  } catch (err) {
    if (err.code === '23514') {
      const campo = extraerCampoCheck(err.constraint);
      const mensaje = campo
        ? `El valor del campo ${campo} está fuera del rango permitido`
        : 'Un valor no cumple las reglas permitidas';
      const e = new Error(mensaje);
      e.status = 422;
      e.codigo = 'FUERA_DE_RANGO';
      e.campo = campo;
      e.constraint = err.constraint;
      throw e;
    }
    if (err.code === 'P0001') {
      const e = new Error(err.message || 'La atención está cerrada');
      e.status = 409;
      e.codigo = 'CERRADA';
      throw e;
    }
    throw err;
  }
}

/**
 * Consulta y lista las atenciones clínicas recientes.
 * Une historias_clinicas, pacientes, usuarios (médico) y aseguradoras activas.
 * Permite filtrar por médico o listar todas.
 */
async function listarAtenciones({ medicoId = null, limite = 30 } = {}, ctx) {
  const sql = `
    SELECT a.id,
           a.fecha,
           to_char(a.fecha, 'HH24:MI') AS hora,
           to_char(a.fecha, 'DD/MM/YYYY HH24:MI') AS fecha_formateada,
           a.estado,
           a.motivo_consulta,
           a.medico_id,
           u.nombre AS medico_nombre,
           p.id AS paciente_id,
           p.nombres || ' ' || p.apellidos AS paciente_nombre,
           p.tipo_documento || ' ' || p.numero_documento AS documento,
           p.sexo,
           EXTRACT(YEAR FROM age(p.fecha_nacimiento))::int AS edad,
           (SELECT s.nombre
              FROM paciente_aseguradora pa
              JOIN aseguradoras s ON s.id = pa.aseguradora_id
             WHERE pa.paciente_id = p.id AND pa.activo AND s.activo
               AND CURRENT_DATE BETWEEN pa.fecha_inicio AND pa.fecha_fin
             ORDER BY pa.fecha_inicio DESC
             LIMIT 1) AS eps
      FROM atenciones a
      JOIN historias_clinicas h ON h.id = a.historia_id
      JOIN pacientes p ON p.id = h.paciente_id
      JOIN usuarios u ON u.id = a.medico_id
     WHERE ($1::uuid IS NULL OR a.medico_id = $1)
     ORDER BY (CASE WHEN a.estado = 'ABIERTA' THEN 0 ELSE 1 END), a.fecha DESC
     LIMIT $2
  `;

  const limiteFinal = Number.isInteger(limite) ? limite : (parseInt(limite, 10) || 30);
  const params = [medicoId || null, limiteFinal];

  if (ctx) {
    return db.tx(ctx, async (c) => {
      const { rows } = await c.query(sql, params);
      return rows;
    });
  }

  const { rows } = await db.query(sql, params);
  return rows;
}

/**
 * Resumen clínico de la atención para la nota de alta (epicrisis - C.21).
 * Retorna diagnósticos, procedimientos, órdenes diagnósticas y resultados con estado de revisión.
 *
 * @param {string} atencionId
 * @param {object} [ctx]
 * @returns {Promise<{ diagnosticos: Array, procedimientos: Array, ordenes: Array, resultados: Array }>}
 */
async function resumen(atencionId, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    return {
      diagnosticos: [],
      procedimientos: [],
      ordenes: [],
      resultados: [],
    };
  }

  const ejecutar = async (client) => {
    const diagSql = `
      SELECT da.cie10_id, c.codigo, c.descripcion, da.tipo
        FROM diagnosticos_atencion da
        JOIN diagnosticos_cie10 c ON c.id = da.cie10_id
       WHERE da.atencion_id = $1
       ORDER BY (CASE WHEN da.tipo = 'PRINCIPAL' THEN 0 ELSE 1 END), da.fecha_creacion ASC
    `;

    const procSql = `
      SELECT pa.cups_id, c.codigo, c.descripcion, to_char(pa.fecha, 'YYYY-MM-DD') AS fecha
        FROM procedimientos_atencion pa
        JOIN procedimientos_cups c ON c.id = pa.cups_id
       WHERE pa.atencion_id = $1
       ORDER BY pa.fecha_creacion ASC
    `;

    const ordSql = `
      SELECT od.id, od.codigo, od.tipo, od.estado, od.fecha
        FROM ordenes_diagnosticas od
       WHERE od.atencion_id = $1
       ORDER BY od.fecha ASC
    `;

    const resSql = `
      SELECT rd.id,
             rd.orden_id,
             od.codigo AS orden_codigo,
             rd.tipo,
             rd.informe,
             rd.fecha_resultado,
             EXISTS (
               SELECT 1
                 FROM notificaciones n
                WHERE n.resultado_id = rd.id
                  AND n.leido = true
             ) AS revisado
        FROM resultados_diagnosticos rd
        JOIN ordenes_diagnosticas od ON od.id = rd.orden_id
       WHERE od.atencion_id = $1
       ORDER BY rd.fecha_resultado ASC
    `;

    const diagRes = await client.query(diagSql, [atencionId]);
    const procRes = await client.query(procSql, [atencionId]);
    const ordRes = await client.query(ordSql, [atencionId]);
    const resRes = await client.query(resSql, [atencionId]);

    return {
      diagnosticos: diagRes.rows,
      procedimientos: procRes.rows,
      ordenes: ordRes.rows,
      resultados: resRes.rows,
    };
  };

  if (ctx && ctx.query) {
    return ejecutar(ctx);
  }
  if (ctx && ctx.usuarioId !== undefined) {
    return db.tx(ctx, ejecutar);
  }
  return ejecutar(db);
}

/**
 * Evalúa las reglas del checklist de cierre para una atención clínica.
 * - 4 reglas bloqueantes: diagnóstico principal, nota de alta, al menos una evolución médica SOAP, consentimientos firmados.
 * - 1 regla informativa/visual: motivo de consulta y toma de signos vitales.
 *
 * @param {string} atencionId
 * @param {object} [ctx]
 * @returns {Promise<{ puedeCerrar: boolean, reglas: Array<object> }>}
 */
async function validarCierre(atencionId, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    const err = new Error('Atención no encontrada');
    err.status = 404;
    err.codigo = 'ATENCION_NO_ENCONTRADA';
    throw err;
  }

  const sql = `
    SELECT
      a.id,
      a.estado,
      (length(trim(coalesce(a.motivo_consulta, ''))) > 0) AS tiene_motivo,
      EXISTS (SELECT 1 FROM signos_vitales sv WHERE sv.atencion_id = a.id) AS tiene_signos,
      EXISTS (SELECT 1 FROM diagnosticos_atencion da WHERE da.atencion_id = a.id AND da.tipo = 'PRINCIPAL') AS tiene_diagnostico_principal,
      (SELECT c.codigo
         FROM diagnosticos_atencion da
         JOIN diagnosticos_cie10 c ON c.id = da.cie10_id
        WHERE da.atencion_id = a.id AND da.tipo = 'PRINCIPAL'
        LIMIT 1) AS diag_principal_codigo,
      (SELECT c.descripcion
         FROM diagnosticos_atencion da
         JOIN diagnosticos_cie10 c ON c.id = da.cie10_id
        WHERE da.atencion_id = a.id AND da.tipo = 'PRINCIPAL'
        LIMIT 1) AS diag_principal_descripcion,
      EXISTS (SELECT 1 FROM notas_alta na WHERE na.atencion_id = a.id) AS tiene_nota_alta,
      (SELECT count(*)::int FROM evoluciones_medicas em WHERE em.atencion_id = a.id) AS total_evoluciones,
      (SELECT count(*)::int FROM consentimientos_medicos cm WHERE cm.atencion_id = a.id) AS total_consentimientos,
      (SELECT count(*)::int FROM consentimientos_medicos cm WHERE cm.atencion_id = a.id AND cm.firmado = false) AS consentimientos_sin_firmar
    FROM atenciones a
    WHERE a.id = $1
  `;

  const ejecutar = async (client) => {
    const { rows: [row] } = await client.query(sql, [atencionId]);
    if (!row) {
      const err = new Error('Atención no encontrada');
      err.status = 404;
      err.codigo = 'ATENCION_NO_ENCONTRADA';
      throw err;
    }

    const cumpleDiag = Boolean(row.tiene_diagnostico_principal);
    const cumpleAlta = Boolean(row.tiene_nota_alta);
    const cumpleEvol = (row.total_evoluciones || 0) >= 1;
    const cumpleCons = (row.consentimientos_sin_firmar || 0) === 0;
    const cumpleMotivoSignos = Boolean(row.tiene_motivo && row.tiene_signos);

    const puedeCerrar = Boolean(cumpleDiag && cumpleAlta && cumpleEvol && cumpleCons);

    const reglas = [
      {
        regla: 'diagnostico_principal',
        descripcion: 'Diagnóstico principal codificado (CIE-10)',
        cumple: cumpleDiag,
        bloqueante: true,
        detalle: cumpleDiag
          ? (row.diag_principal_codigo ? `(${row.diag_principal_codigo}) ${row.diag_principal_descripcion || ''}`.trim() : 'Diagnóstico principal registrado y codificado')
          : 'Se requiere registrar al menos un diagnóstico de tipo PRINCIPAL',
        codigo: row.diag_principal_codigo || null,
        descripcion_cie: row.diag_principal_descripcion || null,
        enlace: `/atenciones/${atencionId}/diagnosticos`,
      },
      {
        regla: 'nota_alta',
        descripcion: 'Nota de alta (epicrisis)',
        cumple: cumpleAlta,
        bloqueante: true,
        detalle: cumpleAlta
          ? 'Nota de alta registrada con resumen y recomendaciones'
          : 'Se requiere registrar la nota de alta médica (epicrisis)',
        enlace: `/atenciones/${atencionId}/alta`,
      },
      {
        regla: 'evolucion_medica',
        descripcion: 'Evolución médica SOAP',
        cumple: cumpleEvol,
        bloqueante: true,
        detalle: cumpleEvol
          ? `${row.total_evoluciones} evolución(es) médica(s) registrada(s)`
          : 'Se requiere al menos una evolución médica SOAP registrada y firmada',
        enlace: `/atenciones/${atencionId}/evolucion`,
      },
      {
        regla: 'consentimientos_firmados',
        descripcion: 'Consentimientos informados firmados',
        cumple: cumpleCons,
        bloqueante: true,
        detalle: cumpleCons
          ? ((row.total_consentimientos || 0) > 0 ? 'Todos los consentimientos requeridos están firmados' : 'Sin consentimientos pendientes de firma')
          : `${row.consentimientos_sin_firmar} consentimiento(s) pendiente(s) de firma`,
        enlace: `/atenciones/${atencionId}/consentimientos`,
      },
      {
        regla: 'motivo_signos',
        descripcion: 'Motivo de consulta y toma de signos vitales',
        cumple: cumpleMotivoSignos,
        bloqueante: false,
        detalle: cumpleMotivoSignos
          ? 'Motivo de consulta y signos vitales registrados'
          : (!row.tiene_motivo && !row.tiene_signos
              ? 'Falta diligenciar motivo de consulta y toma de signos vitales'
              : (!row.tiene_motivo ? 'Falta diligenciar motivo de consulta' : 'Falta registrar toma de signos vitales')),
        enlace: `/atenciones/${atencionId}/consulta`,
      },
    ];

    return {
      puedeCerrar,
      reglas,
      diagnostico_principal: cumpleDiag,
      nota_alta: cumpleAlta,
      evolucion_medica: cumpleEvol,
      consentimientos_firmados: cumpleCons,
      motivo_signos: cumpleMotivoSignos,
      diagnostico_principal_codigo: row.diag_principal_codigo || null,
      diagnostico_principal_descripcion: row.diag_principal_descripcion || null,
    };
  };

  if (ctx && ctx.query) {
    return ejecutar(ctx);
  }
  return ejecutar(db);
}

/**
 * Cierra definitivamente la atención clínica, validando titularidad y checklist bloqueante.
 * La firma criptográfica SHA-256 y fecha_cierre son generadas exclusivamente por el trigger Postgres.
 *
 * @param {string} atencionId
 * @param {string} usuarioId
 * @param {object} [ctx]
 * @returns {Promise<object>} { id, estado, fecha_cierre, fecha_cierre_formateada, firma_hash }
 */
async function cerrar(atencionId, usuarioId, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    const err = new Error('Atención no encontrada');
    err.status = 404;
    err.codigo = 'ATENCION_NO_ENCONTRADA';
    throw err;
  }

  const txCtx = (ctx && ctx.usuarioId !== undefined) ? ctx : { usuarioId: usuarioId || '', ip: '' };

  try {
    return await db.tx(txCtx, async (c) => {
      // 1. Consultar atención con bloqueo FOR UPDATE
      const { rows: [a] } = await c.query(
        'SELECT id, estado, medico_id FROM atenciones WHERE id = $1 FOR UPDATE',
        [atencionId]
      );

      if (!a) {
        const err = new Error('Atención no encontrada');
        err.status = 404;
        err.codigo = 'ATENCION_NO_ENCONTRADA';
        throw err;
      }

      // 2. Verificar titularidad médica
      if (a.medico_id !== usuarioId) {
        let esAdmin = ctx?.rol === 'ADMINISTRADOR';
        if (!esAdmin && usuarioId) {
          const { rows: [u] } = await c.query(
            'SELECT r.nombre AS rol FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1',
            [usuarioId]
          );
          if (u && u.rol === 'ADMINISTRADOR') {
            esAdmin = true;
          }
        }
        if (!esAdmin) {
          const err = new Error('Solo el médico titular puede cerrar la atención');
          err.status = 403;
          err.codigo = 'NO_ES_TITULAR';
          throw err;
        }
      }

      // 3. Verificar estado actual
      if (a.estado === 'CERRADA') {
        const err = new Error('La atención ya está cerrada');
        err.status = 409;
        err.codigo = 'CERRADA';
        throw err;
      }

      // 4. Evaluar checklist de cierre
      const checklist = await validarCierre(atencionId, c);
      if (!checklist.puedeCerrar) {
        const faltantes = [];
        if (!checklist.diagnostico_principal) faltantes.push('diagnóstico principal (CIE-10)');
        if (!checklist.nota_alta) faltantes.push('nota de alta (epicrisis)');
        if (!checklist.evolucion_medica) faltantes.push('al menos una evolución médica SOAP');
        if (!checklist.consentimientos_firmados) faltantes.push('consentimientos informados firmados');

        const err = new Error(`No se puede cerrar la atención. Requisitos pendientes: ${faltantes.join(', ')}`);
        err.status = 409;
        err.codigo = 'CHECKLIST_INCOMPLETO';
        err.reglas = checklist.reglas;
        throw err;
      }

      // 5. UPDATE: trigger trg_atenciones_cierre calcula firma_hash y fecha_cierre
      const { rows: [cerrada] } = await c.query(
        `UPDATE atenciones
            SET estado = 'CERRADA'
          WHERE id = $1 AND estado = 'ABIERTA'
         RETURNING id, estado, fecha_cierre, to_char(fecha_cierre, 'DD/MM/YYYY HH24:MI:SS') AS fecha_cierre_formateada, firma_hash`,
        [atencionId]
      );

      if (!cerrada) {
        const err = new Error('No se pudo cerrar la atención');
        err.status = 409;
        err.codigo = 'ERROR_CIERRE';
        throw err;
      }

      return {
        id: cerrada.id,
        estado: cerrada.estado,
        fecha_cierre: cerrada.fecha_cierre,
        fecha_cierre_formateada: cerrada.fecha_cierre_formateada,
        firma_hash: cerrada.firma_hash,
      };
    });
  } catch (err) {
    if (err.code === 'P0001') {
      const e = new Error(err.message || 'No se puede cerrar la atención por regla de negocio');
      e.status = 409;
      e.codigo = 'REGLA_DE_NEGOCIO';
      throw e;
    }
    throw err;
  }
}

/**
 * Verifica la integridad criptográfica de la atención invocando la función de base de datos fn_verificar_firma.
 *
 * @param {string} atencionId
 * @param {object} [ctx]
 * @returns {Promise<{ valida: boolean }>}
 */
async function verificarFirma(atencionId, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    return { valida: false };
  }

  const sql = 'SELECT fn_verificar_firma($1) AS valida';
  const ejecutar = async (client) => {
    const { rows } = await client.query(sql, [atencionId]);
    return { valida: Boolean(rows[0] && rows[0].valida) };
  };

  if (ctx && ctx.query) {
    return ejecutar(ctx);
  }
  return ejecutar(db);
}

module.exports = {
  iniciarDesdeCita,
  cargar,
  resumenPaciente,
  guardarMotivo,
  registrarSignos,
  listarAtenciones,
  resumen,
  validarCierre,
  cerrar,
  verificarFirma,
  CAMPOS_SIGNOS,
};


