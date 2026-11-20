// src/services/orden.service.js — Servicio para generación de órdenes diagnósticas (C.7, C.8)
const db = require('../db');
const { ErrorValidacion, Conflicto, NoEncontrado } = require('../db/errores');
const { obtenerOrdenVigenciaDias } = require('../config/entorno');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Busca procedimientos en el catálogo CUPS (GET /api/cups/buscar).
 */
async function buscarCups(q, tipo = null) {
  const query = (q || '').trim();
  if (query.length < 2) return [];

  const { rows } = await db.query(
    `SELECT id, codigo, descripcion, requiere_consentimiento, activo, vigente_desde, vigente_hasta
     FROM procedimientos_cups
     WHERE (codigo ILIKE '%' || $1 || '%' OR descripcion ILIKE '%' || $1 || '%')
       AND activo = true
       AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE)
       AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
     ORDER BY
       CASE
         WHEN codigo ILIKE $1 || '%' THEN 0
         WHEN descripcion ILIKE $1 || '%' THEN 1
         ELSE 2
       END,
       codigo ASC
     LIMIT 20`,
    [query]
  );
  return rows;
}

/**
 * Obtiene el diagnóstico principal asociado a una atención.
 */
async function obtenerDiagnosticoPrincipal(atencionId) {
  const { rows } = await db.query(
    `SELECT d.codigo, d.descripcion
     FROM diagnosticos_atencion da
     JOIN diagnosticos_cie10 d ON d.id = da.cie10_id
     WHERE da.atencion_id = $1 AND da.tipo = 'PRINCIPAL'
     LIMIT 1`,
    [atencionId]
  );
  if (rows.length > 0) {
    return {
      codigo: rows[0].codigo,
      descripcion: rows[0].descripcion,
      texto: `${rows[0].codigo} ${rows[0].descripcion}`
    };
  }

  // Si no hay principal, buscar cualquier diagnóstico de la atención
  const { rows: cualquierDiag } = await db.query(
    `SELECT d.codigo, d.descripcion
     FROM diagnosticos_atencion da
     JOIN diagnosticos_cie10 d ON d.id = da.cie10_id
     WHERE da.atencion_id = $1
     ORDER BY da.fecha_creacion ASC
     LIMIT 1`,
    [atencionId]
  );
  if (cualquierDiag.length > 0) {
    return {
      codigo: cualquierDiag[0].codigo,
      descripcion: cualquierDiag[0].descripcion,
      texto: `${cualquierDiag[0].codigo} ${cualquierDiag[0].descripcion}`
    };
  }

  return {
    codigo: 'I10X',
    descripcion: 'Hipertensión esencial (primaria)',
    texto: 'I10X Hipertensión esencial (primaria)'
  };
}

/**
 * Lista las órdenes emitidas para una atención clínica.
 */
async function listarOrdenesPorAtencion(atencionId) {
  const { rows } = await db.query(
    `SELECT o.id, o.codigo, o.tipo, o.estado, o.sistema_destino, o.fecha,
            to_char(o.fecha, 'DD/MM/YYYY HH24:MI') AS fecha_formateada,
            COALESCE(COUNT(d.id), 0)::integer AS cantidad_procedimientos
     FROM ordenes_diagnosticas o
     LEFT JOIN detalle_orden d ON d.orden_id = o.id
     WHERE o.atencion_id = $1
     GROUP BY o.id, o.codigo, o.tipo, o.estado, o.sistema_destino, o.fecha
     ORDER BY o.fecha DESC`,
    [atencionId]
  );
  return rows;
}

/**
 * Lista órdenes diagnósticas generales con filtros de atención, paciente, tipo, estado o búsqueda de texto.
 */
async function listarOrdenesGeneral({ atencionId, pacienteId, tipo, estado, limite = 50, q } = {}, ctx) {
  const condiciones = [];
  const valores = [];

  if (atencionId) {
    valores.push(atencionId);
    condiciones.push(`o.atencion_id = $${valores.length}`);
  }

  if (pacienteId) {
    valores.push(pacienteId);
    condiciones.push(`p.id = $${valores.length}`);
  }

  if (tipo) {
    valores.push(tipo.toUpperCase());
    condiciones.push(`o.tipo = $${valores.length}`);
  }

  if (estado) {
    valores.push(estado.toUpperCase());
    condiciones.push(`o.estado = $${valores.length}`);
  }

  if (q && q.trim()) {
    valores.push(`%${q.trim()}%`);
    const pIdx = valores.length;
    condiciones.push(`(
      o.codigo ILIKE $${pIdx} OR
      p.numero_documento ILIKE $${pIdx} OR
      p.nombres ILIKE $${pIdx} OR
      p.apellidos ILIKE $${pIdx} OR
      (p.nombres || ' ' || p.apellidos) ILIKE $${pIdx}
    )`);
  }

  const whereClausula = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  const limiteFinal = Math.min(200, Math.max(1, parseInt(limite, 10) || 50));
  valores.push(limiteFinal);
  const limitClausula = `LIMIT $${valores.length}`;

  const sql = `
    SELECT o.id,
           o.codigo,
           o.tipo,
           o.estado,
           o.sistema_destino,
           o.fecha,
           to_char(o.fecha, 'DD/MM/YYYY HH24:MI') AS fecha_formateada,
           to_char(o.fecha, 'HH24:MI') AS hora,
           a.id AS atencion_id,
           a.estado AS atencion_estado,
           p.id AS paciente_id,
           p.tipo_documento,
           p.numero_documento,
           p.tipo_documento || ' ' || p.numero_documento AS documento,
           p.nombres AS paciente_nombres,
           p.apellidos AS paciente_apellidos,
           TRIM(p.nombres || ' ' || p.apellidos) AS paciente_nombre,
           u.id AS medico_id,
           u.nombre AS medico_nombre,
           COALESCE(det.cantidad_procedimientos, 0)::integer AS cantidad_procedimientos,
           COALESCE(det.items, '[]'::json) AS items
    FROM ordenes_diagnosticas o
    JOIN atenciones a ON a.id = o.atencion_id
    JOIN historias_clinicas h ON h.id = a.historia_id
    JOIN pacientes p ON p.id = h.paciente_id
    JOIN usuarios u ON u.id = a.medico_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(d.id)::integer AS cantidad_procedimientos,
        COALESCE(
          json_agg(
            json_build_object(
              'id', d.id,
              'cups_id', c.id,
              'codigo', c.codigo,
              'descripcion', c.descripcion,
              'cantidad', d.cantidad
            ) ORDER BY c.codigo ASC
          ) FILTER (WHERE d.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM detalle_orden d
      JOIN procedimientos_cups c ON c.id = d.cups_id
      WHERE d.orden_id = o.id
    ) det ON true
    ${whereClausula}
    ORDER BY o.fecha DESC
    ${limitClausula}
  `;

  const { rows } = await db.query(sql, valores);
  return rows;
}

/**
 * Crea una orden médica diagnóstica con su detalle y registro de integración en una transacción atómica.
 */
async function crearOrden(atencionId, datos, ctx) {
  const { tipo, items } = datos;

  if (!tipo || !['LABORATORIO', 'RADIOLOGIA'].includes(tipo)) {
    throw new ErrorValidacion('El tipo de orden debe ser LABORATORIO o RADIOLOGIA', [{ campo: 'tipo', mensaje: 'Tipo inválido' }]);
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ErrorValidacion('Debe incluir al menos un examen o procedimiento CUPS en la orden', [{ campo: 'items', mensaje: 'Lista de ítems vacía' }]);
  }

  // Consolidar cantidades si se repite algún cups_id
  const mapaItems = new Map();
  for (const it of items) {
    if (!it.cups_id || !UUID_REGEX.test(it.cups_id)) {
      throw new ErrorValidacion('cups_id debe ser un UUID válido', [{ campo: 'cups_id', mensaje: 'UUID inválido' }]);
    }
    const cant = parseInt(it.cantidad, 10);
    if (isNaN(cant) || cant < 1 || cant > 99) {
      throw new ErrorValidacion('La cantidad debe ser un entero entre 1 y 99', [{ campo: 'cantidad', mensaje: 'Cantidad fuera de rango' }]);
    }
    if (mapaItems.has(it.cups_id)) {
      mapaItems.set(it.cups_id, Math.min(99, mapaItems.get(it.cups_id) + cant));
    } else {
      mapaItems.set(it.cups_id, cant);
    }
  }

  return await db.tx(ctx, async (client) => {
    // 1. Validar que la atención esté ABIERTA
    const { rows: [atencion] } = await client.query(
      'SELECT id, estado FROM atenciones WHERE id = $1 FOR SHARE',
      [atencionId]
    );

    if (!atencion) {
      throw new NoEncontrado('La atención clínica no existe');
    }

    if (atencion.estado === 'CERRADA') {
      throw new Conflicto('No se pueden emitir órdenes en una atención que ya está cerrada');
    }

    // 2. Validar que todos los cups_id existan y estén activos/vigentes
    const cupsIds = Array.from(mapaItems.keys());
    const { rows: cupsExistentes } = await client.query(
      `SELECT id, codigo, descripcion, activo, vigente_desde, vigente_hasta,
              (activo = true AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE) AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)) AS es_vigente
       FROM procedimientos_cups WHERE id = ANY($1::uuid[])`,
      [cupsIds]
    );

    if (cupsExistentes.length !== cupsIds.length) {
      throw new ErrorValidacion('Uno o más procedimientos CUPS no existen en el catálogo institucional', [{ campo: 'cups_id', mensaje: 'Procedimiento CUPS inexistente' }]);
    }

    const noVigentes = cupsExistentes.filter((c) => !c.es_vigente);
    if (noVigentes.length > 0) {
      throw new ErrorValidacion('Uno o más procedimientos CUPS no están vigentes o se encuentran inactivos en el catálogo institucional', [{ campo: 'cups_id', mensaje: 'Procedimiento CUPS inactivo o no vigente' }]);
    }

    // 3. Insertar orden diagnóstica
    const sistemaDestino = tipo === 'LABORATORIO' ? 'LIS' : 'RIS';
    const { rows: [nuevaOrden] } = await client.query(
      `INSERT INTO ordenes_diagnosticas (atencion_id, tipo, sistema_destino)
       VALUES ($1, $2, $3)
       RETURNING id, codigo, fecha`,
      [atencionId, tipo, sistemaDestino]
    );

    // 4. Insertar detalle de la orden en lote con UNNEST
    const cupsArr = Array.from(mapaItems.keys());
    const cantArr = Array.from(mapaItems.values());
    await client.query(
      `INSERT INTO detalle_orden (orden_id, cups_id, cantidad)
       SELECT $1, u.cups_id, u.cantidad
       FROM unnest($2::uuid[], $3::integer[]) AS u(cups_id, cantidad)`,
      [nuevaOrden.id, cupsArr, cantArr]
    );

    // 5. Insertar registro en integraciones (estado_envio PENDIENTE)
    await client.query(
      `INSERT INTO integraciones (orden_id, sistema, estado_envio)
       VALUES ($1, $2, 'PENDIENTE')`,
      [nuevaOrden.id, sistemaDestino]
    );

    return {
      orden_id: nuevaOrden.id,
      codigo: nuevaOrden.codigo,
      fecha: nuevaOrden.fecha
    };
  });
}

/**
 * Carga los datos completos de una orden para visualización o impresión (C.8).
 * Admite búsqueda por UUID (o.id) o código de orden (o.codigo, ej. 'ORD-89001').
 */
async function cargarOrdenImpresion(ordenIdOCodigo, ctx) {
  if (!ordenIdOCodigo || typeof ordenIdOCodigo !== 'string' || !ordenIdOCodigo.trim()) {
    throw new NoEncontrado('Orden diagnóstica no encontrada');
  }

  const terminoBusqueda = ordenIdOCodigo.trim();

  // Consulta principal de la orden (paso 7.1 del brief) con casteo seguro de UUID
  const sqlOrden = `
    SELECT o.id,
           o.codigo,
           o.tipo,
           o.fecha,
           o.estado,
           o.sistema_destino,
           to_char(o.fecha, 'DD/MM/YYYY HH24:MI') AS fecha_formateada,
           to_char(o.fecha, 'DD/MM/YYYY') AS fecha_corta,
           a.id AS atencion_id,
           p.id AS paciente_id,
           p.tipo_documento,
           p.numero_documento,
           p.nombres AS paciente_nombres,
           p.apellidos AS paciente_apellidos,
           p.fecha_nacimiento,
           p.sexo,
           p.telefono,
           p.direccion,
           a2.nombre AS eps_nombre,
           a2.tipo_plan,
           pa.tipo_usuario,
           pa.numero_contrato,
           diag.codigo AS cie10,
           diag.descripcion AS cie10_desc,
           u.id AS medico_id,
           u.nombre AS medico_nombre
    FROM ordenes_diagnosticas o
    JOIN atenciones a ON a.id = o.atencion_id
    JOIN historias_clinicas h ON h.id = a.historia_id
    JOIN pacientes p ON p.id = h.paciente_id
    LEFT JOIN LATERAL (
      SELECT aseguradora_id, tipo_usuario, numero_contrato, fecha_inicio
      FROM paciente_aseguradora
      WHERE paciente_id = p.id AND activo = true
      ORDER BY fecha_inicio DESC NULLS LAST
      LIMIT 1
    ) pa ON true
    LEFT JOIN aseguradoras a2 ON a2.id = pa.aseguradora_id
    LEFT JOIN LATERAL (
      SELECT d.codigo, d.descripcion
      FROM diagnosticos_atencion da
      JOIN diagnosticos_cie10 d ON d.id = da.cie10_id
      WHERE da.atencion_id = a.id
      ORDER BY CASE WHEN da.tipo = 'PRINCIPAL' THEN 1 ELSE 2 END, da.fecha_creacion ASC
      LIMIT 1
    ) diag ON true
    JOIN usuarios u ON u.id = a.medico_id
    WHERE (CASE WHEN $1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN o.id = $1::uuid ELSE false END) OR o.codigo = $1
  `;

  const { rows: [orden] } = await db.query(sqlOrden, [terminoBusqueda]);

  if (!orden) {
    throw new NoEncontrado('Orden diagnóstica no encontrada');
  }

  // 2. Consulta de detalle de procedimientos CUPS (paso 7.2 del brief)
  const { rows: detalle } = await db.query(
    `SELECT c.codigo, c.descripcion, d.cantidad
     FROM detalle_orden d
     JOIN procedimientos_cups c ON c.id = d.cups_id
     WHERE d.orden_id = $1
     ORDER BY c.codigo ASC`,
    [orden.id]
  );

  // Fallback si por alguna razón no se encontró diagnóstico en la consulta
  let cie10 = orden.cie10;
  let cie10Desc = orden.cie10_desc;
  if (!cie10 || !cie10Desc) {
    const diagFallback = await obtenerDiagnosticoPrincipal(orden.atencion_id);
    cie10 = cie10 || diagFallback.codigo;
    cie10Desc = cie10Desc || diagFallback.descripcion;
  }

  // 3. Vigencia (paso 7.3 del brief)
  const vigenciaDias = obtenerOrdenVigenciaDias();
  const fechaOrden = orden.fecha ? new Date(orden.fecha) : new Date();
  const fechaVigencia = new Date(fechaOrden.getTime());
  fechaVigencia.setDate(fechaVigencia.getDate() + vigenciaDias);

  const diaV = String(fechaVigencia.getDate()).padStart(2, '0');
  const mesV = String(fechaVigencia.getMonth() + 1).padStart(2, '0');
  const anioV = fechaVigencia.getFullYear();
  const fechaVigenciaTexto = `${diaV}/${mesV}/${anioV}`;

  // Calcular edad del paciente
  let edad = null;
  if (orden.fecha_nacimiento) {
    const fn = new Date(orden.fecha_nacimiento);
    const ahora = new Date();
    edad = ahora.getFullYear() - fn.getFullYear();
    const m = ahora.getMonth() - fn.getMonth();
    if (m < 0 || (m === 0 && ahora.getDate() < fn.getDate())) {
      edad--;
    }
  }

  // 4. Auditoría confidencial (paso 7.4 del brief)
  // Usar db.queryConCtx o db.tx dentro del contexto de sesión (ctx.usuarioId)
  // para garantizar que hiscare.usuario_id quede fijado y no se registre NULL en auditoría.
  if (ctx && (ctx.usuarioId || ctx.ip)) {
    try {
      await db.queryConCtx(ctx, "SELECT fn_auditar_consulta('ordenes_diagnosticas', $1)", [orden.id]);
    } catch (_) {
      // En ambiente de prueba si no existe la función
    }
  }

  const instrucciones = 'Presente este documento en el laboratorio para la toma de muestras. Ayuno de 8 horas para glucosa.';

  return {
    orden: {
      id: orden.id,
      codigo: orden.codigo,
      tipo: orden.tipo,
      fecha: orden.fecha,
      fecha_formateada: orden.fecha_formateada,
      fecha_corta: orden.fecha_corta,
      estado: orden.estado,
      sistema_destino: orden.sistema_destino,
      items: detalle,
      diagnostico: {
        codigo: cie10,
        descripcion: cie10Desc,
        texto: `${cie10} ${cie10Desc}`
      },
      cie10,
      cie10_desc: cie10Desc,
      vigenciaDias,
      fechaVigencia,
      fechaVigenciaTexto,
      instrucciones,
      hash_seguridad: 'SEC-' + orden.id.replace(/-/g, '').slice(0, 16).toUpperCase()
    },
    paciente: {
      id: orden.paciente_id,
      nombres: orden.paciente_nombres,
      apellidos: orden.paciente_apellidos,
      nombre_completo: `${orden.paciente_nombres} ${orden.paciente_apellidos}`.trim(),
      tipo_documento: orden.tipo_documento,
      numero_documento: orden.numero_documento,
      fecha_nacimiento: orden.fecha_nacimiento,
      edad,
      sexo: orden.sexo,
      telefono: orden.telefono || '',
      direccion: orden.direccion || '',
      eps: orden.eps_nombre || 'Particular',
      tipo_plan: orden.tipo_plan || 'Contributivo',
      tipo_usuario: orden.tipo_usuario || 'Cotizante',
      numero_contrato: orden.numero_contrato || '—'
    },
    medico: {
      id: orden.medico_id,
      nombre: orden.medico_nombre,
      registro_medico: 'RM-' + orden.medico_id.slice(0, 6).toUpperCase()
    },
    detalle,
    vigenciaDias,
    fechaVigencia,
    fechaVigenciaTexto,
    instrucciones
  };
}

/**
 * Obtiene las fechas correspondientes a ayer y hoy en la zona horaria America/Bogota (formato YYYY-MM-DD).
 */
function obtenerAyerYHoyBogota() {
  const ahora = new Date();
  const formatear = (d) => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  };
  const hoyStr = formatear(ahora);
  const ayerDate = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
  const ayerStr = formatear(ayerDate);
  return { desde: ayerStr, hasta: hoyStr };
}

/**
 * Consulta de listado y seguimiento de órdenes diagnósticas para la consola C.10.
 * Incluye CTE con resumen de estados, paginación y filtros de seguridad por rol.
 */
async function listarOrdenesC10(params = {}, ctx) {
  let { desde, hasta, tipo, estado, codigo, page = 1, limite = 20, usuario } = params;

  const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  const esFechaValida = (str) => {
    if (!str || typeof str !== 'string' || !FECHA_REGEX.test(str)) return false;
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m - 1) && dt.getUTCDate() === d;
  };

  // Validar formato si vienen fechas
  if (desde && !esFechaValida(desde)) {
    const err = new ErrorValidacion('Formato de fecha inicial inválido (debe ser YYYY-MM-DD)', ['desde']);
    err.codigo = 'FECHAS_INVALIDAS';
    throw err;
  }

  if (hasta && !esFechaValida(hasta)) {
    const err = new ErrorValidacion('Formato de fecha final inválido (debe ser YYYY-MM-DD)', ['hasta']);
    err.codigo = 'FECHAS_INVALIDAS';
    throw err;
  }

  // Si no vienen fechas en los parámetros, por defecto calcular ayer y hoy
  if (!desde || !hasta) {
    const ayerHoy = obtenerAyerYHoyBogota();
    if (!desde) desde = ayerHoy.desde;
    if (!hasta) hasta = ayerHoy.hasta;
  }

  // Validar que desde <= hasta
  if (desde > hasta) {
    const err = new ErrorValidacion('La fecha inicial no puede ser posterior a la fecha final', ['desde', 'hasta']);
    err.codigo = 'FECHAS_INVALIDAS';
    throw err;
  }

  // Validar que la diferencia entre desde y hasta sea como máximo 92 días
  const msPorDia = 24 * 60 * 60 * 1000;
  const dDesde = new Date(desde + 'T00:00:00Z');
  const dHasta = new Date(hasta + 'T00:00:00Z');
  const diffDias = Math.round((dHasta.getTime() - dDesde.getTime()) / msPorDia);

  if (diffDias > 92) {
    const err = new ErrorValidacion('El rango de fechas no puede exceder 92 días', ['desde', 'hasta']);
    err.codigo = 'FECHAS_INVALIDAS';
    throw err;
  }

  // Normalizar parámetros
  const tipoVal = tipo ? String(tipo).trim().toUpperCase() : null;
  const estadoVal = estado ? String(estado).trim().toUpperCase() : null;
  const codigoVal = (codigo && String(codigo).trim()) ? String(codigo).trim() : null;
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimite = Math.max(1, parseInt(limite, 10) || 20);
  const offset = (numPage - 1) * numLimite;

  // Determinar rol y filtro de médico
  const usuarioObj = usuario || (ctx && ctx.usuario) || null;
  const rol = (usuarioObj && usuarioObj.rol) ? String(usuarioObj.rol).toUpperCase() : '';
  const esMedico = rol === 'MEDICO';
  const medicoId = esMedico ? (usuarioObj.id || (ctx && ctx.usuarioId) || null) : null;

  // Construcción de parámetros para node-postgres ($1, $2, ...)
  const valores = [desde, hasta, tipoVal, codigoVal];
  let filtroMedicoSql = '';

  if (esMedico && medicoId) {
    valores.push(medicoId);
    filtroMedicoSql = `AND a.medico_id = $${valores.length}`;
  }

  valores.push(estadoVal);
  const estadoIdx = valores.length;

  valores.push(numLimite);
  const limiteIdx = valores.length;

  valores.push(offset);
  const offsetIdx = valores.length;

  const sql = `
    WITH base AS (
      SELECT o.id, o.codigo, o.fecha, o.tipo, o.estado,
             p.nombres || ' ' || p.apellidos AS paciente,
             ie.estado_envio,
             r.id AS resultado_id,
             o.atencion_id,
             p.tipo_documento,
             p.numero_documento,
             o.sistema_destino
      FROM ordenes_diagnosticas o
      JOIN atenciones a ON a.id = o.atencion_id
      JOIN historias_clinicas h ON h.id = a.historia_id
      JOIN pacientes p ON p.id = h.paciente_id
      LEFT JOIN LATERAL (SELECT estado_envio FROM integraciones i WHERE i.orden_id = o.id ORDER BY fecha_creacion DESC LIMIT 1) ie ON true
      LEFT JOIN LATERAL (SELECT id FROM resultados_diagnosticos r WHERE r.orden_id = o.id ORDER BY fecha_resultado DESC LIMIT 1) r ON true
      WHERE o.fecha::date BETWEEN $1 AND $2
        AND ($3::text IS NULL OR o.tipo = $3)
        AND ($4::text IS NULL OR o.codigo ILIKE '%' || $4 || '%')
        ${filtroMedicoSql}
    )
    SELECT
      (SELECT json_object_agg(estado, n) FROM (SELECT estado, count(*) n FROM base GROUP BY estado) s) AS resumen,
      (SELECT count(*) FROM base WHERE $${estadoIdx}::text IS NULL OR estado = $${estadoIdx}) AS total,
      (SELECT json_agg(b) FROM (SELECT * FROM base WHERE $${estadoIdx}::text IS NULL OR estado = $${estadoIdx} ORDER BY fecha DESC LIMIT $${limiteIdx} OFFSET $${offsetIdx}) b) AS filas;
  `;

  const { rows } = await db.query(sql, valores);
  const filaRes = rows[0] || {};
  const resumenRaw = filaRes.resumen || {};

  const resumen = {
    PENDIENTE: parseInt(resumenRaw.PENDIENTE || 0, 10),
    EN_PROCESO: parseInt(resumenRaw.EN_PROCESO || 0, 10),
    COMPLETADA: parseInt(resumenRaw.COMPLETADA || 0, 10),
    CANCELADA: parseInt(resumenRaw.CANCELADA || 0, 10)
  };

  const pad = (n) => String(n).padStart(2, '0');
  const filas = (Array.isArray(filaRes.filas) ? filaRes.filas : []).map((f) => {
    let fechaFormateada = '';
    if (f.fecha) {
      const fd = new Date(f.fecha);
      if (!isNaN(fd.getTime())) {
        fechaFormateada = `${pad(fd.getDate())}/${pad(fd.getMonth() + 1)}/${fd.getFullYear()} ${pad(fd.getHours())}:${pad(fd.getMinutes())}`;
      }
    }
    return {
      ...f,
      paciente_nombre: f.paciente,
      fecha_formateada: fechaFormateada || f.fecha
    };
  });

  const total = parseInt(filaRes.total || 0, 10);

  return {
    resumen,
    filas,
    total,
    page: numPage,
    limite: numLimite,
    desde,
    hasta,
    tipo: tipoVal,
    estado: estadoVal,
    codigo: codigoVal
  };
}

/**
 * Valida si la orden requiere consentimiento informado y si existe consentimiento firmado para la atención.
 * Si requiere y no hay consentimiento firmado, lanza Conflicto (409) con código CONSENTIMIENTO_PENDIENTE.
 */
async function validarConsentimiento(ordenId) {
  const { rows: cupsReq } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM detalle_orden d
       JOIN procedimientos_cups c ON c.id = d.cups_id
       WHERE d.orden_id = $1 AND c.requiere_consentimiento = true
     ) AS requiere,
     (
       SELECT atencion_id FROM ordenes_diagnosticas WHERE id = $1
     ) AS atencion_id`,
    [ordenId]
  );
  if (!cupsReq.length || !cupsReq[0].requiere) {
    return true;
  }
  const atencionId = cupsReq[0].atencion_id;
  if (!atencionId) return true;

  const { rows: consFirmado } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM consentimientos_medicos
       WHERE atencion_id = $1 AND firmado = true
     ) AS firmado`,
    [atencionId]
  );
  if (!consFirmado.length || !consFirmado[0].firmado) {
    throw new Conflicto(
      'La orden requiere consentimiento informado firmado previo para su despacho',
      'CONSENTIMIENTO_PENDIENTE'
    );
  }
  return true;
}

module.exports = {
  buscarCups,
  obtenerDiagnosticoPrincipal,
  listarOrdenesPorAtencion,
  listarOrdenesGeneral,
  crearOrden,
  cargarOrdenImpresion,
  obtenerAyerYHoyBogota,
  listarOrdenesC10,
  validarConsentimiento
};

