// src/services/paciente.service.js — lógica de negocio para pacientes, afiliaciones, contactos y ficha única (C.3, C.15)
const db = require('../db');
const afiliacionService = require('./afiliacion.service');

/**
 * Colapsa espacios múltiples y elimina espacios en los extremos.
 */
function colapsarEspacios(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Convierte una cadena a formato Capitalizado / Title Case respetando tildes y caracteres especiales.
 * Ejemplo: "JUAN DIEGO" -> "Juan Diego", "pérez garcía" -> "Pérez García"
 */
function toTitleCase(str) {
  const limpio = colapsarEspacios(str);
  if (!limpio) return '';
  return limpio
    .toLowerCase()
    .split(' ')
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ');
}

/**
 * Normaliza un número telefónico:
 * Elimina espacios internos y agrega el prefijo +57 a celulares colombianos de 10 dígitos.
 * Ejemplo: "3001234567" -> "+573001234567", "573001234567" -> "+573001234567"
 */
function normalizarTelefono(tel) {
  if (!tel || typeof tel !== 'string') return null;
  const limpio = tel.trim().replace(/\s+/g, '');
  if (!limpio) return null;

  // Celular de 10 dígitos que comienza en 3
  if (/^3\d{9}$/.test(limpio)) {
    return `+57${limpio}`;
  }
  // Celular con 57 y 10 dígitos que comienzan en 3
  if (/^573\d{9}$/.test(limpio)) {
    return `+${limpio}`;
  }
  // Ya viene con prefijo +57
  if (/^\+573\d{9}$/.test(limpio)) {
    return limpio;
  }
  // Fijo u otro formato permitido
  return limpio;
}

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Valida si una cadena cumple el formato canónico de UUID.
 *
 * @param {string} id
 * @returns {boolean}
 */
function esUUID(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Registra un nuevo paciente junto con su afiliación y contactos de emergencia
 * dentro de una única transacción en PostgreSQL (HIS-NF-08).
 *
 * @param {object} dto - Datos de entrada validados
 * @param {object} ctx - Contexto de auditoría ({ usuarioId, ip })
 * @returns {Promise<{ paciente_id: string }>}
 */
async function crear(dto, ctx) {
  const pacienteData = dto.paciente || {};
  const afiliacionData = dto.afiliacion || {};
  const contactosData = dto.contactos || [];

  const tipoDocumento = (pacienteData.tipo_documento || '').trim().toUpperCase();
  const numeroDocumento = (pacienteData.numero_documento || '').trim();
  const nombres = toTitleCase(pacienteData.nombres);
  const apellidos = toTitleCase(pacienteData.apellidos);
  const fechaNacimiento = pacienteData.fecha_nacimiento || null;
  const sexo = pacienteData.sexo || null;
  const telefono = normalizarTelefono(pacienteData.telefono);
  const direccion = pacienteData.direccion ? colapsarEspacios(pacienteData.direccion) : null;

  let nuevoPacienteId = null;

  try {
    nuevoPacienteId = await db.tx(ctx, async (client) => {
      // Paso 1: Insertar registro en tabla pacientes
      const resPaciente = await client.query(
        `INSERT INTO pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, telefono, direccion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [tipoDocumento, numeroDocumento, nombres, apellidos, fechaNacimiento, sexo, telefono, direccion]
      );
      const pacienteId = resPaciente.rows[0].id;

      // Paso 2: Insertar afiliación a aseguradora
      const aseguradoraId = afiliacionData.aseguradora_id;
      const tipoUsuario = afiliacionData.tipo_usuario || null;
      const numeroContrato = afiliacionData.numero_contrato ? colapsarEspacios(afiliacionData.numero_contrato) : null;
      const fechaInicio = afiliacionData.fecha_inicio || null;
      const fechaFin = afiliacionData.fecha_fin || null;

      await client.query(
        `INSERT INTO paciente_aseguradora (paciente_id, aseguradora_id, tipo_usuario, numero_contrato, fecha_inicio, fecha_fin)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [pacienteId, aseguradoraId, tipoUsuario, numeroContrato, fechaInicio, fechaFin]
      );

      // Paso 3: Insertar contactos de emergencia
      for (const contacto of contactosData) {
        const cNombre = toTitleCase(contacto.nombre);
        const cParentesco = contacto.parentesco ? colapsarEspacios(contacto.parentesco) : null;
        const cTelefono = normalizarTelefono(contacto.telefono);

        await client.query(
          `INSERT INTO contactos_emergencia (paciente_id, nombre, parentesco, telefono)
           VALUES ($1, $2, $3, $4)`,
          [pacienteId, cNombre, cParentesco, cTelefono]
        );
      }

      return pacienteId;
    });

    return { paciente_id: nuevoPacienteId };
  } catch (err) {
    // Si ocurre violación UNIQUE (documento ya existente)
    if (err.code === '23505') {
      const { rows } = await db.query(
        'SELECT id, nombres, apellidos FROM pacientes WHERE numero_documento = $1',
        [numeroDocumento]
      );
      const existente = rows[0];
      const errorNegocio = new Error('Ya existe un paciente registrado con este documento');
      errorNegocio.codigo = 'PACIENTE_DUPLICADO';
      errorNegocio.paciente_id = existente ? existente.id : null;
      errorNegocio.status = 409;
      throw errorNegocio;
    }
    throw err;
  }
}

/**
 * Consulta si un paciente ya se encuentra registrado por número y tipo de documento.
 *
 * @param {string} [tipo] - Tipo de documento (CC, TI, etc.)
 * @param {string} numero - Número de documento
 * @returns {Promise<{ existe: boolean, paciente_id?: string, nombre?: string }>}
 */
async function verificarExistencia(tipo, numero) {
  if (!numero || !String(numero).trim()) {
    return { existe: false };
  }

  const numDoc = String(numero).trim();
  let sql = 'SELECT id, nombres, apellidos, tipo_documento, numero_documento FROM pacientes WHERE numero_documento = $1';
  const params = [numDoc];

  if (tipo && String(tipo).trim()) {
    sql += ' AND tipo_documento = $2';
    params.push(String(tipo).trim().toUpperCase());
  }

  const { rows } = await db.query(sql, params);
  if (rows.length > 0) {
    const p = rows[0];
    return {
      existe: true,
      paciente_id: p.id,
      nombre: `${p.nombres} ${p.apellidos}`,
    };
  }

  return { existe: false };
}

/**
 * Obtiene la lista de aseguradoras activas en el sistema, con filtros opcionales.
 *
 * @param {object} [queryFiltro={}] - Filtros { q, tipo_plan }
 * @returns {Promise<Array<{ id: string, nombre: string, tipo_plan: string }>>}
 */
async function obtenerAseguradorasActivas(queryFiltro = {}) {
  const { q, tipo_plan } = queryFiltro;
  let sql = 'SELECT id, nombre, tipo_plan FROM aseguradoras WHERE activo = true';
  const params = [];

  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    sql += ` AND nombre ILIKE $${params.length}`;
  }

  if (tipo_plan && String(tipo_plan).trim()) {
    params.push(String(tipo_plan).trim());
    sql += ` AND tipo_plan = $${params.length}`;
  }

  sql += ' ORDER BY nombre ASC';

  const { rows } = await db.query(sql, params);
  return rows;
}

const LATERAL_EPS_SQL = `
  LEFT JOIN LATERAL (
    SELECT s.id AS aseguradora_id, s.nombre AS eps
    FROM paciente_aseguradora pa
    JOIN aseguradoras s ON s.id = pa.aseguradora_id
    WHERE pa.paciente_id = p.id
    ORDER BY pa.activo DESC, pa.fecha_inicio DESC NULLS LAST, pa.fecha_creacion DESC
    LIMIT 1
  ) eps_act ON true
`;

function esObjetoPlano(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Valida y parsea el filtro de edad (entero entre 0 y 150).
 *
 * @param {string|number|null|undefined} rawEdad
 * @returns {{ presente: boolean, valida: boolean, valor: number|null }}
 */
function parsearEdadFiltro(rawEdad) {
  if (rawEdad === undefined || rawEdad === null) {
    return { presente: false, valida: true, valor: null };
  }
  const str = String(rawEdad).trim();
  if (str === '') {
    return { presente: false, valida: true, valor: null };
  }
  if (!/^\d+$/.test(str)) {
    return { presente: true, valida: false, valor: null };
  }
  const num = parseInt(str, 10);
  if (!Number.isInteger(num) || num < 0 || num > 150) {
    return { presente: true, valida: false, valor: null };
  }
  return { presente: true, valida: true, valor: num };
}

/**
 * Normaliza los argumentos de entrada para buscar/contar manteniendo
 * compatibilidad hacia atrás con firmas posicionales y objetos de filtros.
 */
function normalizarOpcionesBusqueda(termino = '', tipo = null, limite = 20, offset = 0, filtrosExtra = {}) {
  let numLimite = 20;
  let numOffset = 0;
  let pagFuente = null;
  let fuenteFiltros = {};

  if (esObjetoPlano(termino)) {
    const extraObj = esObjetoPlano(filtrosExtra) ? filtrosExtra : {};
    if (tipo !== undefined && tipo !== null && !esObjetoPlano(tipo)) {
      numLimite = Number(tipo) || 20;
      numOffset = Number(limite) || 0;
      fuenteFiltros = { ...termino, ...extraObj };
    } else {
      const pagObj = esObjetoPlano(tipo) ? tipo : {};
      fuenteFiltros = { ...termino, ...pagObj, ...extraObj };
      numLimite = fuenteFiltros.limite ?? fuenteFiltros.limit ?? 20;
      pagFuente = fuenteFiltros;
    }
  } else {
    const pagObj = esObjetoPlano(limite) ? limite : {};
    const extraObj = esObjetoPlano(filtrosExtra) ? filtrosExtra : {};
    fuenteFiltros = {
      ...pagObj,
      ...extraObj,
      q: termino,
      tipo: tipo != null ? tipo : (extraObj.tipo ?? pagObj.tipo ?? null),
    };

    if (esObjetoPlano(limite)) {
      numLimite = limite.limite ?? limite.limit ?? 20;
      pagFuente = limite;
    } else {
      numLimite = Number(limite) || 20;
      numOffset = Number(offset) || 0;
    }
  }

  const maxResultados = Math.min(Math.max(Number(numLimite) || 20, 1), 100);
  if (pagFuente) {
    numOffset = pagFuente.offset !== undefined
      ? pagFuente.offset
      : (((pagFuente.page || pagFuente.pagina || 1) - 1) * maxResultados);
  }

  const rawQ = fuenteFiltros.q !== undefined && fuenteFiltros.q !== null && String(fuenteFiltros.q).trim() !== ''
    ? fuenteFiltros.q
    : (fuenteFiltros.termino ?? '');

  return {
    q: rawQ,
    tipo: fuenteFiltros.tipo ?? null,
    documento: fuenteFiltros.documento ?? '',
    nombres: fuenteFiltros.nombres ?? '',
    apellidos: fuenteFiltros.apellidos ?? '',
    edad: fuenteFiltros.edad ?? '',
    eps: fuenteFiltros.eps ?? '',
    maxResultados,
    safeOffset: Math.max(0, Number(numOffset) || 0),
  };
}

/**
 * Construye cláusulas WHERE parametrizadas y banderas de JOIN compartidas por buscar() y contar().
 */
function construirFiltrosBusqueda(filtros) {
  const params = [];
  const whereClauses = [];
  let incluirJoinEps = false;

  const q = colapsarEspacios(String(filtros.q || ''));
  const esQNumerico = q ? /^\d+$/.test(q) : false;

  if (q) {
    if (esQNumerico) {
      params.push(`%${q}%`);
      whereClauses.push(`p.numero_documento ILIKE $${params.length}`);
    } else {
      const palabras = q.split(' ').filter(Boolean);
      for (const palabra of palabras) {
        params.push(`%${palabra}%`);
        whereClauses.push(`((p.nombres || ' ' || p.apellidos) ILIKE $${params.length} OR p.numero_documento ILIKE $${params.length})`);
      }
    }
  }

  const tipoDoc = filtros.tipo ? String(filtros.tipo).trim().toUpperCase() : '';
  if (tipoDoc) {
    params.push(tipoDoc);
    whereClauses.push(`p.tipo_documento = $${params.length}`);
  }

  const docFiltro = filtros.documento ? String(filtros.documento).trim() : '';
  if (docFiltro) {
    params.push(`%${docFiltro}%`);
    whereClauses.push(`p.numero_documento ILIKE $${params.length}`);
  }

  const nombresFiltro = colapsarEspacios(String(filtros.nombres || ''));
  if (nombresFiltro) {
    const palabrasNombres = nombresFiltro.split(' ').filter(Boolean);
    for (const palabra of palabrasNombres) {
      params.push(`%${palabra}%`);
      whereClauses.push(`p.nombres ILIKE $${params.length}`);
    }
  }

  const apellidosFiltro = colapsarEspacios(String(filtros.apellidos || ''));
  if (apellidosFiltro) {
    const palabrasApellidos = apellidosFiltro.split(' ').filter(Boolean);
    for (const palabra of palabrasApellidos) {
      params.push(`%${palabra}%`);
      whereClauses.push(`p.apellidos ILIKE $${params.length}`);
    }
  }

  const edadCheck = parsearEdadFiltro(filtros.edad);
  if (edadCheck.presente) {
    if (edadCheck.valida) {
      const edadNum = edadCheck.valor;
      params.push(edadNum + 1);
      const posMin = params.length;
      params.push(edadNum);
      const posMax = params.length;
      whereClauses.push(
        `(p.fecha_nacimiento > (CURRENT_DATE - make_interval(years => $${posMin}))::date AND p.fecha_nacimiento <= (CURRENT_DATE - make_interval(years => $${posMax}))::date)`
      );
    } else {
      whereClauses.push('1 = 0');
    }
  }

  const epsFiltro = filtros.eps ? String(filtros.eps).trim() : '';
  if (epsFiltro) {
    incluirJoinEps = true;
    if (epsFiltro === 'SIN_EPS' || epsFiltro === '__SIN_EPS__') {
      whereClauses.push('eps_act.aseguradora_id IS NULL');
    } else if (esUUID(epsFiltro)) {
      params.push(epsFiltro);
      whereClauses.push(`eps_act.aseguradora_id = $${params.length}`);
    } else {
      params.push(`%${epsFiltro}%`);
      whereClauses.push(`eps_act.eps ILIKE $${params.length}`);
    }
  }

  const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSql, params, incluirJoinEps, q, esQNumerico };
}

/**
 * Búsqueda de pacientes por documento, nombre y filtros avanzados combinables (Pantalla C.15).
 * - Soporta firma posicional clásica y objeto plano de filtros.
 * - Soporta paginación segura con límite (default 20, max 100) y offset (default 0).
 *
 * @param {string|object} [termino=''] - Término de búsqueda o bien objeto completo de filtros
 * @param {string|null} [tipo=null] - Tipo de documento opcional
 * @param {number|object} [limite=20] - Máximo número de resultados o bien objeto de paginación
 * @param {number} [offset=0] - Desplazamiento inicial para paginación
 * @param {object} [filtrosExtra={}] - Filtros adicionales { documento, nombres, apellidos, edad, eps }
 * @returns {Promise<Array<object>>}
 */
async function buscar(termino = '', tipo = null, limite = 20, offset = 0, filtrosExtra = {}) {
  const opts = normalizarOpcionesBusqueda(termino, tipo, limite, offset, filtrosExtra);
  const { whereSql, params, q, esQNumerico } = construirFiltrosBusqueda(opts);

  let sql = `
    SELECT
      p.id,
      p.tipo_documento,
      p.numero_documento,
      p.nombres,
      p.apellidos,
      p.nombres || ' ' || p.apellidos AS nombre_completo,
      p.nombres || ' ' || p.apellidos AS nombre,
      to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
      CASE
        WHEN p.fecha_nacimiento IS NOT NULL THEN date_part('year', age(p.fecha_nacimiento))::int
        ELSE NULL
      END AS edad,
      p.sexo,
      p.telefono,
      p.direccion,
      eps_act.eps AS eps
    FROM pacientes p
    ${LATERAL_EPS_SQL}
    ${whereSql}
  `;

  if (q) {
    if (esQNumerico) {
      params.push(q);
      const posExact = params.length;
      params.push(`${q}%`);
      const posPrefix = params.length;
      sql += ` ORDER BY (p.numero_documento = $${posExact}) DESC, (p.numero_documento ILIKE $${posPrefix}) DESC, p.numero_documento ASC`;
    } else {
      params.push(q);
      const posRaw = params.length;
      sql += ` ORDER BY similarity(p.nombres || ' ' || p.apellidos, $${posRaw}) DESC, p.nombres ASC, p.apellidos ASC`;
    }
  } else {
    sql += ' ORDER BY p.fecha_creacion DESC';
  }

  params.push(opts.maxResultados);
  const posLim = params.length;
  params.push(opts.safeOffset);
  const posOff = params.length;
  sql += ` LIMIT $${posLim} OFFSET $${posOff}`;

  const { rows } = await db.query(sql, params);
  return rows;
}

/**
 * Conteo total de pacientes que cumplen los criterios de búsqueda (Pantalla C.15).
 * Permite calcular paginación (total de registros y total de páginas).
 *
 * @param {string|object} [termino=''] - Término de búsqueda o bien objeto de filtros
 * @param {string|null} [tipo=null] - Tipo de documento opcional
 * @param {object} [filtrosExtra={}] - Filtros adicionales { documento, nombres, apellidos, edad, eps }
 * @returns {Promise<number>}
 */
async function contar(termino = '', tipo = null, filtrosExtra = {}) {
  const opts = normalizarOpcionesBusqueda(termino, tipo, 20, 0, filtrosExtra);
  const { whereSql, params, incluirJoinEps } = construirFiltrosBusqueda(opts);

  let sql = 'SELECT count(*)::int AS total FROM pacientes p';
  if (incluirJoinEps) {
    sql += LATERAL_EPS_SQL;
  }
  sql += whereSql;

  const { rows } = await db.query(sql, params);
  return rows[0] ? Number(rows[0].total || 0) : 0;
}

/**
 * Búsqueda de pacientes con respuesta estructurada para paginación (Pantalla C.15).
 *
 * @param {object} [opciones={}]
 * @returns {Promise<{ filas: Array, total: number, page: number, limite: number, offset: number, totalPaginas: number }>}
 */
async function buscarPaginado({
  termino = '',
  q = '',
  tipo = null,
  documento = '',
  nombres = '',
  apellidos = '',
  edad = '',
  eps = '',
  page = 1,
  pagina = null,
  limite = 20,
  limit = null,
} = {}) {
  const p = Math.max(1, parseInt(pagina != null ? pagina : page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit != null ? limit : limite, 10) || 20));
  const offset = (p - 1) * l;
  const terminoFinal = q != null && String(q).trim() !== '' ? q : termino;
  const filtrosExtra = { documento, nombres, apellidos, edad, eps };

  const [filas, total] = await Promise.all([
    buscar(terminoFinal, tipo, l, offset, filtrosExtra),
    contar(terminoFinal, tipo, filtrosExtra),
  ]);

  return {
    filas,
    total,
    page: p,
    limite: l,
    offset,
    totalPaginas: Math.max(1, Math.ceil(total / l)),
  };
}

/**
 * Obtiene los últimos movimientos del paciente (citas, atenciones, órdenes y resultados).
 * UNION ALL de las 4 fuentes ordenadas cronológicamente en orden descendente.
 *
 * @param {string} pacienteId - UUID del paciente
 * @param {number} [limite=10] - Máximo número de movimientos
 * @param {object} [client=null] - Cliente de base de datos opcional
 * @returns {Promise<Array<object>>}
 */
async function obtenerMovimientos(pacienteId, limite = 10, client = null) {
  if (!esUUID(pacienteId)) {
    return [];
  }

  const maxResultados = Math.min(Math.max(Number(limite) || 10, 1), 50);

  const sql = `
    SELECT
      movs.tipo,
      movs.id,
      to_char(movs.fecha, 'YYYY-MM-DD HH24:MI') AS fecha,
      movs.descripcion,
      movs.estado,
      movs.codigo
    FROM (
      -- 1. Citas
      SELECT
        'CITA' AS tipo,
        c.id,
        c.fecha,
        ('Cita médica' || CASE WHEN u.nombre IS NOT NULL THEN ' - ' || u.nombre ELSE '' END) AS descripcion,
        c.estado,
        ('CIT-' || substr(c.id::text, 1, 6)) AS codigo
      FROM citas c
      JOIN usuarios u ON u.id = c.medico_id
      WHERE c.paciente_id = $1

      UNION ALL

      -- 2. Atenciones
      SELECT
        'ATENCION' AS tipo,
        a.id,
        a.fecha,
        ('Consulta atendida' || CASE WHEN u.nombre IS NOT NULL THEN ' - ' || u.nombre ELSE '' END) AS descripcion,
        a.estado,
        ('ATE-' || substr(a.id::text, 1, 6)) AS codigo
      FROM atenciones a
      JOIN historias_clinicas hc ON hc.id = a.historia_id
      JOIN usuarios u ON u.id = a.medico_id
      WHERE hc.paciente_id = $1

      UNION ALL

      -- 3. Órdenes diagnósticas
      SELECT
        'ORDEN' AS tipo,
        o.id,
        o.fecha,
        ('Orden ' || lower(o.tipo) || ' emitida') AS descripcion,
        o.estado,
        o.codigo AS codigo
      FROM ordenes_diagnosticas o
      JOIN atenciones a ON a.id = o.atencion_id
      JOIN historias_clinicas hc ON hc.id = a.historia_id
      WHERE hc.paciente_id = $1

      UNION ALL

      -- 4. Resultados diagnósticos
      SELECT
        'RESULTADO' AS tipo,
        r.id,
        r.fecha_resultado AS fecha,
        ('Resultado cargado - ' || lower(r.tipo)) AS descripcion,
        'CARGADO' AS estado,
        ('RES-' || substr(r.id::text, 1, 6)) AS codigo
      FROM resultados_diagnosticos r
      JOIN ordenes_diagnosticas od ON od.id = r.orden_id
      JOIN atenciones a ON a.id = od.atencion_id
      JOIN historias_clinicas hc ON hc.id = a.historia_id
      WHERE hc.paciente_id = $1
    ) movs
    ORDER BY movs.fecha DESC
    LIMIT $2
  `;

  const ejecutor = client || db;
  const { rows } = await ejecutor.query(sql, [pacienteId, maxResultados]);
  return rows;
}

/**
 * Consulta el detalle completo de un paciente por su UUID, incluyendo:
 * - Demografía
 * - Afiliación completa usando afiliacion.service.js
 * - Contactos de emergencia
 * - Historia clínica activa
 * - Alergias desde antecedentes (tipo = 'Alergico')
 * - Últimos movimientos
 * Audita el acceso médico sensible llamando a fn_auditar_consulta('pacientes', id) en db.tx(ctx).
 *
 * @param {string} id - Identificador UUID del paciente
 * @param {object} [ctx] - Contexto de auditoría ({ usuarioId, ip })
 * @returns {Promise<object|null>}
 */
async function obtenerDetalle(id, ctx = {}) {
  if (!esUUID(id)) {
    return null;
  }

  const safeCtx = ctx || {};

  return db.tx(safeCtx, async (client) => {
    // 1. Consultar registro demográfico del paciente
    const resPaciente = await client.query(
      `SELECT
         p.id,
         p.tipo_documento,
         p.numero_documento,
         p.nombres,
         p.apellidos,
         p.nombres || ' ' || p.apellidos AS nombre_completo,
         to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
         CASE
           WHEN p.fecha_nacimiento IS NOT NULL THEN date_part('year', age(p.fecha_nacimiento))::int
           ELSE NULL
         END AS edad,
         p.sexo,
         p.telefono,
         p.direccion,
         p.fecha_creacion,
         p.fecha_modificacion
       FROM pacientes p
       WHERE p.id = $1`,
      [id]
    );

    if (resPaciente.rows.length === 0) {
      return null;
    }

    const paciente = resPaciente.rows[0];

    // 2. Auditar consulta médica confidencial en la bitácora institucional (HIS-E-10, HIS-D-04, C.15)
    await client.query("SELECT fn_auditar_consulta('pacientes', $1)", [id]);

    // 3. Consultar afiliación completa usando afiliacion.service.js
    const afiliacion = await afiliacionService.obtenerAfiliacion(id, client);

    // 4. Consultar contactos de emergencia
    const resContactos = await client.query(
      `SELECT
         id,
         nombre,
         telefono,
         parentesco
       FROM contactos_emergencia
       WHERE paciente_id = $1
       ORDER BY fecha_creacion ASC`,
      [id]
    );
    const contactos = resContactos.rows;

    // 5. Consultar si tiene historia clínica aperturada
    const resHistoria = await client.query(
      `SELECT
         id,
         to_char(fecha_apertura, 'YYYY-MM-DD') AS fecha_apertura,
         activo
       FROM historias_clinicas
       WHERE paciente_id = $1
       ORDER BY activo DESC, fecha_apertura DESC
       LIMIT 1`,
      [id]
    );
    const historia = resHistoria.rows[0] || null;

    // 6. Consultar alergias del paciente desde antecedentes (tipo = 'Alergico')
    const resAlergias = await client.query(
      `SELECT a.descripcion
       FROM antecedentes a
       JOIN historias_clinicas hc ON hc.id = a.historia_id
       WHERE hc.paciente_id = $1 AND a.tipo = 'Alergico'
       ORDER BY a.fecha_creacion ASC`,
      [id]
    );
    const alergias = resAlergias.rows.map((r) => r.descripcion);

    // 7. Consultar últimos movimientos llamando a obtenerMovimientos(id)
    const movimientos = await obtenerMovimientos(id, 10, client);

    return {
      id: paciente.id,
      tipo_documento: paciente.tipo_documento,
      numero_documento: paciente.numero_documento,
      nombres: paciente.nombres,
      apellidos: paciente.apellidos,
      nombre_completo: paciente.nombre_completo,
      fecha_nacimiento: paciente.fecha_nacimiento,
      edad: paciente.edad != null ? Number(paciente.edad) : null,
      sexo: paciente.sexo,
      telefono: paciente.telefono,
      direccion: paciente.direccion,
      afiliacion,
      contactos,
      historia_clinica: historia,
      tiene_historia: !!historia,
      alergias,
      movimientos,
    };
  });
}

/**
 * Consulta la lista de contactos de emergencia de un paciente.
 *
 * @param {string} pacienteId - UUID del paciente
 * @returns {Promise<Array<object>>}
 */
async function obtenerContactos(pacienteId) {
  if (!esUUID(pacienteId)) {
    return [];
  }

  const { rows } = await db.query(
    `SELECT id, paciente_id, nombre, parentesco, telefono, fecha_creacion
     FROM contactos_emergencia
     WHERE paciente_id = $1
     ORDER BY fecha_creacion ASC`,
    [pacienteId]
  );
  return rows;
}

/**
 * Agrega un nuevo contacto de emergencia a un paciente con contexto de auditoría (db.tx).
 *
 * @param {string} pacienteId - UUID del paciente
 * @param {object} datos - { nombre, parentesco, telefono }
 * @param {object} [ctx] - Contexto de auditoría ({ usuarioId, ip })
 * @returns {Promise<object>} Contacto insertado
 */
async function agregarContacto(pacienteId, { nombre, parentesco, telefono }, ctx = {}) {
  if (!esUUID(pacienteId)) {
    const errorUUID = new Error('Identificador de paciente no válido');
    errorUUID.status = 404;
    errorUUID.codigo = 'PACIENTE_NO_ENCONTRADO';
    throw errorUUID;
  }

  const cNombre = toTitleCase(nombre);
  const cParentesco = parentesco ? colapsarEspacios(parentesco) : null;
  const cTelefono = normalizarTelefono(telefono);

  return db.tx(ctx, async (client) => {
    // Validar que el paciente existe
    const resExiste = await client.query(
      'SELECT id FROM pacientes WHERE id = $1',
      [pacienteId]
    );
    if (resExiste.rows.length === 0) {
      const errNoExiste = new Error('El paciente especificado no existe');
      errNoExiste.status = 404;
      errNoExiste.codigo = 'PACIENTE_NO_ENCONTRADO';
      throw errNoExiste;
    }

    const res = await client.query(
      `INSERT INTO contactos_emergencia (paciente_id, nombre, parentesco, telefono)
       VALUES ($1, $2, $3, $4)
       RETURNING id, paciente_id, nombre, parentesco, telefono, fecha_creacion`,
      [pacienteId, cNombre, cParentesco, cTelefono]
    );
    return res.rows[0];
  });
}

module.exports = {
  toTitleCase,
  normalizarTelefono,
  parsearEdadFiltro,
  crear,
  verificarExistencia,
  obtenerAseguradorasActivas,
  esUUID,
  obtenerDetalle,
  buscar,
  listar: buscar,
  buscarPaginado,
  contar,
  obtenerMovimientos,
  obtenerContactos,
  agregarContacto,
};
