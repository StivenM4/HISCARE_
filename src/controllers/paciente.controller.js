// src/controllers/paciente.controller.js — controlador para Pantalla C.3 y C.15
const db = require('../db');
const { traducir } = require('../db/errores');
const pacienteService = require('../services/paciente.service');
const afiliacionService = require('../services/afiliacion.service');
const { TIPOS_DOCUMENTO } = require('../validators/paciente.validator');

/**
 * Renderiza la vista de registro de paciente nuevo (Pantalla C.3).
 */
async function renderNuevo(req, res, next) {
  try {
    const aseguradoras = await pacienteService.obtenerAseguradorasActivas();
    const documentoPrellenado = (req.query.documento || '').trim();

    res.render('pacientes/paciente_nuevo', {
      titulo: 'Registro de paciente nuevo',
      aseguradoras,
      tiposDocumento: TIPOS_DOCUMENTO,
      documentoPrellenado,
      moduloActivo: 'pacientes',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Registra un nuevo paciente, su afiliación y sus contactos de emergencia en una única transacción.
 */
async function crearPaciente(req, res, next) {
  try {
    const resultado = await pacienteService.crear(req.body, db.ctxDe(req));
    return res.status(201).json({
      ok: true,
      data: resultado,
    });
  } catch (err) {
    // Conflicto de documento duplicado
    if (err.codigo === 'PACIENTE_DUPLICADO' || err.code === '23505') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_DUPLICADO',
          mensaje: 'Ya existe un paciente con este número de documento',
          paciente_id: err.paciente_id || null,
        },
      });
    }

    // Regla de check o validación de dominio en base de datos
    if (err.code === '23514') {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'FUERA_DE_RANGO',
          mensaje: 'Un valor no cumple las reglas permitidas en la base de datos',
          restriccion: err.constraint || undefined,
        },
      });
    }

    // Referencia de llave foránea inexistente
    if (err.code === '23503') {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'REFERENCIA_INVALIDA',
          mensaje: 'Se referencia un registro inexistente',
          restriccion: err.constraint || undefined,
        },
      });
    }

    // Longitud de cadena excedida (varchar)
    if (err.code === '22001') {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'VALOR_INVALIDO',
          mensaje: 'Uno de los campos supera la longitud máxima permitida',
        },
      });
    }

    // Excepciones lanzadas por triggers de reglas de negocio
    if (err.code === 'P0001') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'REGLA_DE_NEGOCIO',
          mensaje: err.message,
        },
      });
    }

    // Traducción general de errores PostgreSQL
    const trad = traducir(err);
    if (trad) {
      return res.status(trad.status).json({
        ok: false,
        error: trad.error,
      });
    }

    // Cualquier otro error se delega al middleware global 503 sin exponer stack interno (HIS-E-12)
    return next(err);
  }
}

/**
 * Consulta predictiva/en línea de existencia de documento de paciente.
 */
async function existePaciente(req, res, next) {
  try {
    const { tipo, numero } = req.query;
    const resultado = await pacienteService.verificarExistencia(tipo, numero);
    return res.json({
      ok: true,
      data: resultado,
    });
  } catch (err) {
    return next(err);
  }
}

function extraerFiltrosBusqueda(query = {}) {
  const q = query.q != null ? String(query.q).trim() : '';
  const tipo = query.tipo != null ? String(query.tipo).trim().toUpperCase() : '';
  const documento = query.documento != null ? String(query.documento).trim() : '';
  const nombres = query.nombres != null ? String(query.nombres).trim() : '';
  const apellidos = query.apellidos != null ? String(query.apellidos).trim() : '';
  const edad = query.edad != null ? String(query.edad).trim() : '';
  const eps = query.eps != null ? String(query.eps).trim() : '';

  const rawPage = query.page != null ? query.page : query.pagina;
  const rawLimit = query.limit != null ? query.limit : query.limite;

  const page = Math.max(1, parseInt(rawPage, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));
  const offset = (page - 1) * limit;

  return { q, tipo, documento, nombres, apellidos, edad, eps, page, limit, offset };
}

/**
 * Renderiza la búsqueda de pacientes o listado inicial (Pantalla C.15).
 * GET /pacientes -> renderiza pacientes/pacientes_busqueda.ejs
 */
async function renderListado(req, res, next) {
  try {
    const {
      q,
      tipo,
      documento,
      nombres,
      apellidos,
      edad,
      eps,
      page,
      limit,
      offset,
    } = extraerFiltrosBusqueda(req.query);

    const filtrosExtra = { documento, nombres, apellidos, edad, eps };
    const hayFiltros = Boolean(q || tipo || documento || nombres || apellidos || edad || eps);

    const [pacientes, total, aseguradoras] = await Promise.all([
      pacienteService.buscar(q, tipo || null, limit, offset, filtrosExtra),
      pacienteService.contar(q, tipo || null, filtrosExtra),
      pacienteService.obtenerAseguradorasActivas(),
    ]);
    const totalPaginas = Math.max(1, Math.ceil(total / limit));

    return res.render('pacientes/pacientes_busqueda', {
      titulo: 'Búsqueda de pacientes',
      pacientes,
      q,
      tipo,
      documento,
      nombres,
      apellidos,
      edad,
      eps,
      aseguradoras,
      hayFiltros,
      page,
      limit,
      total,
      totalPaginas,
      paginacion: {
        page,
        limit,
        total,
        totalPaginas,
        offset,
      },
      moduloActivo: 'pacientes',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Búsqueda de pacientes vía API REST (Pantalla C.15).
 * GET /api/pacientes/buscar o GET /api/pacientes
 * -> valida q (2-60 caracteres si viene) y edad (entero 0..150 si viene)
 * -> soporta limit (default 20, max 100) y page (default 1, offset = (page - 1) * limit)
 * -> llama pacienteService.buscar y pacienteService.contar
 */
async function apiBuscar(req, res, next) {
  try {
    const {
      q,
      tipo,
      documento,
      nombres,
      apellidos,
      edad,
      eps,
      page,
      limit,
      offset,
    } = extraerFiltrosBusqueda(req.query);

    // Validación de longitud de q (2 a 60 caracteres si viene especificado)
    if (q.length > 0 && (q.length < 2 || q.length > 60)) {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'PARAMETRO_INVALIDO',
          mensaje: 'El parámetro de búsqueda "q" debe contener entre 2 y 60 caracteres',
        },
      });
    }

    // Validación de edad (entero válido entre 0 y 150 si viene especificado)
    const edadCheck = pacienteService.parsearEdadFiltro(edad);
    if (edadCheck.presente && !edadCheck.valida) {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'PARAMETRO_INVALIDO',
          mensaje: 'El parámetro "edad" debe ser un número entero entre 0 y 150',
        },
      });
    }

    const filtrosExtra = { documento, nombres, apellidos, edad, eps };

    const [resultados, total] = await Promise.all([
      pacienteService.buscar(q, tipo || null, limit, offset, filtrosExtra),
      pacienteService.contar(q, tipo || null, filtrosExtra),
    ]);

    const totalPaginas = Math.max(1, Math.ceil(total / limit));

    return res.json({
      ok: true,
      data: resultados,
      paginacion: {
        page,
        limit,
        total,
        totalPaginas,
        offset,
      },
      meta: {
        page,
        limit,
        total,
        totalPaginas,
      },
      page,
      limit,
      total,
      totalPaginas,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Renderiza la ficha clínica única del paciente (Pantalla C.15).
 * GET /pacientes/:id -> si no es UUID responde 404. Llama pacienteService.obtenerDetalle(id, ctx).
 * Pasa duplicado a la vista.
 */
async function renderDetalle(req, res, next) {
  try {
    const { id } = req.params;
    if (!pacienteService.esUUID(id)) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(404).json({
          ok: false,
          error: {
            codigo: 'PACIENTE_NO_ENCONTRADO',
            mensaje: 'El identificador del paciente no es válido',
          },
        });
      }
      return res.status(404).render('errores/404', {
        titulo: 'Paciente no encontrado',
        mensaje: 'El identificador del paciente no es válido o no existe en el sistema.',
        moduloActivo: 'pacientes',
      });
    }

    const paciente = await pacienteService.obtenerDetalle(id, db.ctxDe(req));
    if (!paciente) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(404).json({
          ok: false,
          error: {
            codigo: 'PACIENTE_NO_ENCONTRADO',
            mensaje: 'El paciente solicitado no existe',
          },
        });
      }
      return res.status(404).render('errores/404', {
        titulo: 'Paciente no encontrado',
        mensaje: 'El paciente solicitado no existe en la base de datos.',
        moduloActivo: 'pacientes',
      });
    }

    const duplicado = req.query.duplicado === '1' || req.query.duplicado === 'true';
    const recienGuardado = req.query.guardado === 'true' || req.query.recienGuardado === 'true' || req.query.guardado === '1';

    return res.render('pacientes/paciente_detalle', {
      titulo: paciente.nombre_completo || 'Ficha del paciente',
      paciente,
      moduloActivo: 'pacientes',
      duplicado,
      recienGuardado,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Consulta de detalle de paciente por UUID vía API.
 * GET /api/pacientes/:id
 */
async function apiDetalle(req, res, next) {
  try {
    const { id } = req.params;
    if (!pacienteService.esUUID(id)) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: 'El identificador del paciente no es válido o no existe',
        },
      });
    }

    const paciente = await pacienteService.obtenerDetalle(id, db.ctxDe(req));
    if (!paciente) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: 'El paciente solicitado no fue encontrado',
        },
      });
    }

    return res.json({
      ok: true,
      data: paciente,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Consulta la afiliación en salud del paciente (Pantalla C.15).
 * GET /api/pacientes/:id/afiliacion
 */
async function apiAfiliacion(req, res, next) {
  try {
    const { id } = req.params;
    if (!pacienteService.esUUID(id)) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: 'El identificador del paciente no es válido',
        },
      });
    }

    // Verificar si el paciente existe
    const { rows: pacienteRows } = await db.query(
      'SELECT id FROM pacientes WHERE id = $1',
      [id]
    );
    if (pacienteRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: 'El paciente solicitado no existe',
        },
      });
    }

    const afiliacion = await afiliacionService.obtenerAfiliacion(id);
    return res.json({
      ok: true,
      data: afiliacion,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Consulta los contactos de emergencia del paciente (Pantalla C.15).
 * GET /api/pacientes/:id/contactos
 */
async function apiGetContactos(req, res, next) {
  try {
    const { id } = req.params;
    if (!pacienteService.esUUID(id)) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: 'El identificador del paciente no es válido',
        },
      });
    }

    // Verificar existencia del paciente
    const { rows: pacienteRows } = await db.query(
      'SELECT id FROM pacientes WHERE id = $1',
      [id]
    );
    if (pacienteRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: 'El paciente solicitado no existe',
        },
      });
    }

    const contactos = await pacienteService.obtenerContactos(id);
    return res.json({
      ok: true,
      data: contactos,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Agrega un contacto de emergencia al paciente (Pantalla C.15).
 * POST /api/pacientes/:id/contactos
 */
async function apiCrearContacto(req, res, next) {
  try {
    const { id } = req.params;
    if (!pacienteService.esUUID(id)) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: 'El identificador del paciente no es válido',
        },
      });
    }

    const { nombre, parentesco, telefono } = req.body || {};

    // Validación: El nombre es obligatorio
    if (!nombre || !String(nombre).trim()) {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'CAMPO_REQUERIDO',
          mensaje: 'El nombre es obligatorio',
        },
      });
    }

    const contacto = await pacienteService.agregarContacto(
      id,
      { nombre, parentesco, telefono },
      db.ctxDe(req)
    );

    return res.status(201).json({
      ok: true,
      data: contacto,
    });
  } catch (err) {
    if (err.codigo === 'PACIENTE_NO_ENCONTRADO' || err.status === 404) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: err.message,
        },
      });
    }

    const trad = traducir(err);
    if (trad) {
      return res.status(trad.status).json({
        ok: false,
        error: trad.error,
      });
    }

    return next(err);
  }
}

/**
 * Consulta los últimos movimientos del paciente (Pantalla C.15).
 * GET /api/pacientes/:id/movimientos
 */
async function apiMovimientos(req, res, next) {
  try {
    const { id } = req.params;
    if (!pacienteService.esUUID(id)) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: 'El identificador del paciente no es válido',
        },
      });
    }

    // Verificar si el paciente existe
    const { rows: pacienteRows } = await db.query(
      'SELECT id FROM pacientes WHERE id = $1',
      [id]
    );
    if (pacienteRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'PACIENTE_NO_ENCONTRADO',
          mensaje: 'El paciente solicitado no existe',
        },
      });
    }

    const movimientos = await pacienteService.obtenerMovimientos(id);
    return res.json({
      ok: true,
      data: movimientos,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  renderNuevo,
  crearPaciente,
  existePaciente,
  renderListado,
  apiBuscar,
  renderDetalle,
  apiDetalle,
  apiAfiliacion,
  apiGetContactos,
  apiContactos: apiGetContactos, // Alias para compatibilidad
  apiCrearContacto,
  apiMovimientos,
};
