// src/services/codificacion.service.js — Servicio de codificación CIE-10 y procedimientos CUPS (C.20)
const db = require('../db');
const { ErrorValidacion, Conflicto, NoEncontrado } = require('../db/errores');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Obtiene la codificación actual de una atención clínica (C.20).
 * Retorna diagnósticos ordenados (PRINCIPAL primero) y procedimientos ordenados cronológicamente.
 *
 * @param {string} atencionId
 * @returns {Promise<{ diagnosticos: Array<object>, procedimientos: Array<object> }>}
 */
async function obtenerCodificacion(atencionId) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    return { diagnosticos: [], procedimientos: [] };
  }

  const { rows: diagnosticos } = await db.query(
    `SELECT da.id, da.cie10_id, c.codigo, c.descripcion, da.tipo
     FROM diagnosticos_atencion da
     JOIN diagnosticos_cie10 c ON c.id = da.cie10_id
     WHERE da.atencion_id = $1
     ORDER BY CASE WHEN da.tipo = 'PRINCIPAL' THEN 1 ELSE 2 END, c.codigo ASC`,
    [atencionId]
  );

  const { rows: procedimientos } = await db.query(
    `SELECT pa.id, pa.cups_id, p.codigo, p.descripcion, to_char(pa.fecha, 'YYYY-MM-DD') AS fecha
     FROM procedimientos_atencion pa
     JOIN procedimientos_cups p ON p.id = pa.cups_id
     WHERE pa.atencion_id = $1
     ORDER BY pa.fecha DESC, p.codigo ASC`,
    [atencionId]
  );

  return { diagnosticos, procedimientos };
}

/**
 * Guarda y sincroniza la codificación CIE-10 y procedimientos CUPS para una atención en una sola transacción.
 * - Verifica que la atención esté ABIERTA (falla con 409 si está CERRADA).
 * - Exige exactamente 1 diagnóstico PRINCIPAL y máximo 10 SECUNDARIOS.
 * - Previene colisiones con el índice único ux_diag_principal actualizando primero SECUNDARIO y luego PRINCIPAL.
 * - Mapea errores de catálogo inexistente (FK 23503 -> 422) y colisiones (23505 -> 409).
 *
 * @param {string} atencionId
 * @param {{ diagnosticos: Array<{ cie10_id: string, tipo: string }>, procedimientos?: Array<{ cups_id: string, fecha?: string }> }} payload
 * @param {object} ctx Contexto de auditoría { usuarioId, ip }
 * @returns {Promise<{ ok: boolean }>}
 */
async function guardarCodificacion(atencionId, payload, ctx) {
  if (!atencionId || !UUID_REGEX.test(atencionId)) {
    throw new NoEncontrado('Atención no encontrada');
  }

  const diagnosticos = (payload && Array.isArray(payload.diagnosticos)) ? payload.diagnosticos : [];
  const procedimientos = (payload && Array.isArray(payload.procedimientos)) ? payload.procedimientos : [];

  // 1. Validar lista de diagnósticos
  if (diagnosticos.length === 0) {
    throw new ErrorValidacion('Debe incluir al menos un diagnóstico', [
      { campo: 'diagnosticos', mensaje: 'Debe incluir al menos un diagnóstico' },
    ]);
  }

  let countPrincipal = 0;
  let countSecundario = 0;
  const cie10IdsVistos = new Set();

  for (let i = 0; i < diagnosticos.length; i++) {
    const d = diagnosticos[i];
    if (!d || typeof d !== 'object') {
      throw new ErrorValidacion(`Diagnóstico en posición ${i + 1} inválido`);
    }

    if (!d.cie10_id || !UUID_REGEX.test(d.cie10_id)) {
      throw new ErrorValidacion(`Identificador de diagnóstico en posición ${i + 1} no es válido`, [
        { campo: `diagnosticos[${i}].cie10_id`, mensaje: 'UUID inválido' },
      ]);
    }

    if (!['PRINCIPAL', 'SECUNDARIO'].includes(d.tipo)) {
      throw new ErrorValidacion(`El tipo de diagnóstico debe ser 'PRINCIPAL' o 'SECUNDARIO'`, [
        { campo: `diagnosticos[${i}].tipo`, mensaje: 'Tipo inválido' },
      ]);
    }

    if (cie10IdsVistos.has(d.cie10_id)) {
      throw new ErrorValidacion('No se permiten diagnósticos duplicados en la atención', [
        { campo: `diagnosticos[${i}].cie10_id`, mensaje: 'Diagnóstico duplicado' },
      ]);
    }
    cie10IdsVistos.add(d.cie10_id);

    if (d.tipo === 'PRINCIPAL') {
      countPrincipal++;
    } else if (d.tipo === 'SECUNDARIO') {
      countSecundario++;
    }
  }

  if (countPrincipal > 1) {
    throw new Conflicto('Solo puede existir un diagnóstico principal', 'DUPLICADO_PRINCIPAL');
  }

  if (countPrincipal === 0) {
    throw new ErrorValidacion('Debe especificar un diagnóstico principal', [
      { campo: 'diagnosticos', mensaje: 'Debe especificar un diagnóstico principal' },
    ]);
  }

  if (countSecundario > 10) {
    throw new ErrorValidacion('No puede registrar más de 10 diagnósticos secundarios', [
      { campo: 'diagnosticos', mensaje: 'No puede registrar más de 10 diagnósticos secundarios' },
    ]);
  }

  // 2. Validar lista de procedimientos (si se envían)
  for (let i = 0; i < procedimientos.length; i++) {
    const p = procedimientos[i];
    if (!p || typeof p !== 'object') {
      throw new ErrorValidacion(`Procedimiento en posición ${i + 1} inválido`);
    }

    if (!p.cups_id || !UUID_REGEX.test(p.cups_id)) {
      throw new ErrorValidacion(`Identificador de procedimiento en posición ${i + 1} no es válido`, [
        { campo: `procedimientos[${i}].cups_id`, mensaje: 'UUID inválido' },
      ]);
    }

    if (p.fecha !== undefined && p.fecha !== null && String(p.fecha).trim() !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha).trim())) {
        throw new ErrorValidacion(`La fecha del procedimiento debe tener formato YYYY-MM-DD`, [
          { campo: `procedimientos[${i}].fecha`, mensaje: 'Formato de fecha inválido' },
        ]);
      }
    }
  }

  // 3. Ejecución dentro de transacción de base de datos
  try {
    return await db.tx(ctx, async (client) => {
      // Verificar que la atención exista y su estado
      const { rows: [atencion] } = await client.query(
        'SELECT id, estado, medico_id FROM atenciones WHERE id = $1 FOR UPDATE',
        [atencionId]
      );

      if (!atencion) {
        throw new NoEncontrado('Atención no encontrada');
      }

      if (atencion.estado !== 'ABIERTA') {
        throw new Conflicto('HIS-E-07: la atencion esta cerrada; registre una adenda', 'ATENCION_CERRADA');
      }

      // Validar existencia y vigencia de diagnósticos CIE-10 (HIS-E-11)
      const idsDiag = diagnosticos.map((d) => d.cie10_id);
      const { rows: diagsEnBd } = await client.query(
        `SELECT id, codigo, descripcion, activo, vigente_desde, vigente_hasta,
                (activo = true AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE) AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)) AS es_vigente
         FROM diagnosticos_cie10
         WHERE id = ANY($1::uuid[])`,
        [idsDiag]
      );

      if (diagsEnBd.length !== idsDiag.length) {
        throw new ErrorValidacion('Código inexistente en catálogo', [
          { campo: 'catalogo', mensaje: 'Código inexistente en catálogo' },
        ]);
      }

      const diagsNoVigentes = diagsEnBd.filter((d) => !d.es_vigente);
      if (diagsNoVigentes.length > 0) {
        const codigos = diagsNoVigentes.map((d) => d.codigo).join(', ');
        throw new ErrorValidacion(
          `Uno o más diagnósticos CIE-10 (${codigos}) se encuentran inactivos o no vigentes en el catálogo institucional (HIS-E-11)`,
          [{ campo: 'diagnosticos', mensaje: `Diagnóstico ${codigos} no vigente o inactivo (HIS-E-11)` }]
        );
      }

      // Validar existencia y vigencia de procedimientos CUPS (si se envían) (HIS-E-11)
      if (procedimientos.length > 0) {
        const idsCups = Array.from(new Set(procedimientos.map((p) => p.cups_id)));
        const { rows: cupsEnBd } = await client.query(
          `SELECT id, codigo, descripcion, activo, vigente_desde, vigente_hasta,
                  (activo = true AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE) AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)) AS es_vigente
           FROM procedimientos_cups
           WHERE id = ANY($1::uuid[])`,
          [idsCups]
        );

        if (cupsEnBd.length !== idsCups.length) {
          throw new ErrorValidacion('Código inexistente en catálogo', [
            { campo: 'catalogo', mensaje: 'Código inexistente en catálogo' },
          ]);
        }

        const cupsNoVigentes = cupsEnBd.filter((p) => !p.es_vigente);
        if (cupsNoVigentes.length > 0) {
          const codigos = cupsNoVigentes.map((p) => p.codigo).join(', ');
          throw new ErrorValidacion(
            `Uno o más procedimientos CUPS (${codigos}) se encuentran inactivos o no vigentes en el catálogo institucional (HIS-E-11)`,
            [{ campo: 'procedimientos', mensaje: `Procedimiento ${codigos} no vigente o inactivo (HIS-E-11)` }]
          );
        }
      }

      // Paso 1: Diagnósticos
      const idsConservar = diagnosticos.map((d) => d.cie10_id);

      // Eliminar los que ya no están en la lista
      await client.query(
        'DELETE FROM diagnosticos_atencion WHERE atencion_id = $1 AND NOT (cie10_id = ANY($2::uuid[]))',
        [atencionId, idsConservar]
      );

      // Para evitar choque con ux_diag_principal al actualizar o intercambiar roles:
      // Primero insertamos/actualizamos los secundarios
      const secundarios = diagnosticos.filter((d) => d.tipo === 'SECUNDARIO');
      for (const d of secundarios) {
        await client.query(
          `INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
           VALUES ($1, $2, $3)
           ON CONFLICT (atencion_id, cie10_id)
           DO UPDATE SET tipo = EXCLUDED.tipo, fecha_modificacion = now()`,
          [atencionId, d.cie10_id, 'SECUNDARIO']
        );
      }

      // Luego insertamos/actualizamos el diagnóstico principal
      const principal = diagnosticos.find((d) => d.tipo === 'PRINCIPAL');
      if (principal) {
        await client.query(
          `INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
           VALUES ($1, $2, $3)
           ON CONFLICT (atencion_id, cie10_id)
           DO UPDATE SET tipo = EXCLUDED.tipo, fecha_modificacion = now()`,
          [atencionId, principal.cie10_id, 'PRINCIPAL']
        );
      }

      // Paso 2: Procedimientos
      await client.query(
        'DELETE FROM procedimientos_atencion WHERE atencion_id = $1',
        [atencionId]
      );

      for (const p of procedimientos) {
        const fechaLimpia = (p.fecha && String(p.fecha).trim()) ? String(p.fecha).trim() : null;
        if (fechaLimpia) {
          await client.query(
            `INSERT INTO procedimientos_atencion (atencion_id, cups_id, fecha)
             VALUES ($1, $2, $3::date)`,
            [atencionId, p.cups_id, fechaLimpia]
          );
        } else {
          await client.query(
            `INSERT INTO procedimientos_atencion (atencion_id, cups_id, fecha)
             VALUES ($1, $2, CURRENT_DATE)`,
            [atencionId, p.cups_id]
          );
        }
      }

      return { ok: true };
    });
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint === 'ux_diag_principal') {
        throw new Conflicto('Solo puede existir un diagnóstico principal', 'DUPLICADO_PRINCIPAL');
      }
      throw new Conflicto('Registro duplicado en la atención', 'DUPLICADO');
    }
    if (err.code === '23503') {
      throw new ErrorValidacion('Código inexistente en catálogo', [
        { campo: 'catalogo', mensaje: 'Código inexistente en catálogo' },
      ]);
    }
    if (err.code === 'P0001') {
      throw new Conflicto(err.message || 'HIS-E-07: la atencion esta cerrada; registre una adenda', 'REGLA_DE_NEGOCIO');
    }
    throw err;
  }
}

module.exports = {
  obtenerCodificacion,
  guardarCodificacion,
};
