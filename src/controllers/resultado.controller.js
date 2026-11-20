// src/controllers/resultado.controller.js — Controlador para pantallas C.24 (Carga) y C.25 (Consulta de resultados)
const fs = require('fs');
const db = require('../db');
const resultadoService = require('../services/resultado.service');
const atencionService = require('../services/atencion.service');
const { traducir } = require('../db/errores');

/**
 * Elimina de manera segura un archivo subido en caso de error de validación o persistencia.
 */
function limpiarArchivo(file) {
  if (file && file.path) {
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (err) {
      console.error('Error al limpiar archivo huérfano:', err);
    }
  }
}

/**
 * GET /resultados/carga
 * Renderiza la interfaz de usuario para carga de resultados diagnósticos (Pantalla C.24).
 */
async function renderCarga(req, res, next) {
  try {
    return res.render('resultados/carga', {
      titulo: 'Carga de resultados diagnósticos',
      moduloActivo: 'resultados',
      figuraTrace: 'C24',
      usuario: req.session ? req.session.usuario : null,
      scripts: ['/js/carga_resultado.js'],
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/ordenes/:codigo
 * Busca una orden diagnóstica por su código (ej. ORD-89001) o ID.
 * Valida si la orden existe y si su estado permite cargar resultados.
 */
async function buscarOrden(req, res, next) {
  try {
    const { codigo } = req.params;
    const orden = await resultadoService.buscarOrdenPorCodigo(codigo);

    if (!orden) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'ORDEN_NO_ENCONTRADA',
          mensaje: 'Orden diagnóstica no encontrada',
        },
      });
    }

    if (orden.estado === 'CANCELADA') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'ORDEN_CANCELADA',
          mensaje: 'HIS-E-08: la orden está cancelada',
        },
      });
    }

    if (orden.estado === 'COMPLETADA') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'ORDEN_COMPLETADA',
          mensaje: 'La orden ya ha sido completada',
        },
      });
    }

    return res.status(200).json({
      ok: true,
      data: orden,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/ordenes/:id/resultados
 * Carga el informe y/o archivo del resultado diagnóstico de una orden.
 */
async function guardarResultado(req, res, next) {
  const { id } = req.params;
  const { informe, fecha_resultado } = req.body || {};
  const archivo = req.file;

  const textoInforme = typeof informe === 'string' ? informe.trim() : '';

  // Validación 1: Debe haber al menos informe textual o archivo adjunto
  if (!textoInforme && !archivo) {
    limpiarArchivo(archivo);
    return res.status(422).json({
      ok: false,
      error: {
        codigo: 'CAMPOS_REQUERIDOS',
        mensaje: 'Debe ingresar un informe textual o adjuntar un archivo',
      },
    });
  }

  // Validación 2: Fecha de resultado no puede ser futura
  let fechaParsed = new Date();
  if (fecha_resultado && String(fecha_resultado).trim()) {
    const d = new Date(fecha_resultado);
    if (isNaN(d.getTime())) {
      limpiarArchivo(archivo);
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'FECHA_INVALIDA',
          mensaje: 'La fecha del resultado no es válida',
        },
      });
    }

    // Permitir una holgura de 60 segundos por sincronización de reloj
    if (d.getTime() > Date.now() + 60000) {
      limpiarArchivo(archivo);
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'FECHA_FUTURA',
          mensaje: 'La fecha del resultado no puede ser futura',
        },
      });
    }
    fechaParsed = d;
  }

  const archivoUrl = archivo ? `/uploads/resultados/${archivo.filename}` : null;
  const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
  const ip = (req.ip || '').replace('::ffff:', '');

  try {
    const resultado = await resultadoService.guardarResultado({
      ordenId: id,
      informe: textoInforme || null,
      archivoUrl,
      fechaResultado: fechaParsed,
      usuarioId,
      ip,
    });

    return res.status(201).json({
      ok: true,
      data: {
        resultado_id: resultado.id,
      },
    });
  } catch (err) {
    // Si la operación falló, limpiamos el archivo guardado en disco
    limpiarArchivo(archivo);

    // Si el error fue lanzado con status semántico (404, 409, 422)
    if (err.status) {
      return res.status(err.status).json({
        ok: false,
        error: {
          codigo: err.codigo || 'ERROR_OPERACION',
          mensaje: err.message,
        },
      });
    }

    // Errores de triggers o reglas de negocio de PostgreSQL
    if (err.code === 'P0001') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'ORDEN_CANCELADA',
          mensaje: err.message,
        },
      });
    }

    const traducido = traducir(err);
    if (traducido) {
      return res.status(traducido.status).json({
        ok: false,
        error: traducido.error,
      });
    }

    return next(err);
  }
}

/**
 * GET /resultados/:id
 * GET /pacientes/:id/resultados
 * Renderiza la interfaz de consulta de resultados diagnósticos (Pantalla C.25).
 * Resuelve la atención y expediente del paciente para el banner institucional.
 */
async function renderVisor(req, res, next) {
  try {
    const { id } = req.params;
    const ctx = db.ctxDe(req);
    const esRutaPaciente = req.originalUrl.includes('/pacientes/');

    let resultado = null;
    let pacienteId = null;
    let resultadosPaciente = [];

    if (esRutaPaciente) {
      pacienteId = id;
      resultadosPaciente = await resultadoService.listarResultadosPaciente(pacienteId, ctx);
      if (resultadosPaciente.length > 0) {
        resultado = await resultadoService.obtenerDetalleResultado(resultadosPaciente[0].id, ctx);
      }
    } else {
      resultado = await resultadoService.obtenerDetalleResultado(id, ctx);
      pacienteId = resultado.paciente_id;
      resultadosPaciente = await resultadoService.listarResultadosPaciente(pacienteId, ctx);
    }

    // Obtener datos clínicos para el banner institucional (_banner_paciente.ejs)
    let atencion = null;
    if (resultado && resultado.atencion_id) {
      atencion = await atencionService.cargar(resultado.atencion_id, ctx);
    }

    let paciente = null;
    if (pacienteId) {
      paciente = await atencionService.resumenPaciente(pacienteId, ctx);
    }

    if (!paciente && !atencion) {
      return res.status(404).render('errores/404', {
        titulo: 'Paciente o resultado no encontrado',
        mensaje: 'No se encontró la información del paciente o resultado solicitado.',
        moduloActivo: 'resultados',
      });
    }

    // Si atencion es null (ej. paciente sin resultados o sin atención directa), armar wrapper para _banner_paciente
    if (!atencion && paciente) {
      atencion = {
        id: null,
        codigo_atencion: 'HC-' + (paciente.id ? paciente.id.slice(0, 8).toUpperCase() : '0000'),
        codigo: 'HC-' + (paciente.id ? paciente.id.slice(0, 8).toUpperCase() : '0000'),
        estado: 'ACTIVA',
        paciente: `${paciente.nombres || ''} ${paciente.apellidos || ''}`.trim() || 'Paciente',
        nombres: paciente.nombres,
        apellidos: paciente.apellidos,
        tipo_documento: paciente.tipo_documento,
        numero_documento: paciente.numero_documento,
        documento: paciente.documento,
        edad: paciente.edad,
        sexo: paciente.sexo,
        eps: paciente.eps,
        regimen: paciente.regimen,
        alergias: paciente.alergias || [],
      };
    }

    return res.render('resultados/visor', {
      titulo: 'Consulta de resultados',
      moduloActivo: 'resultados',
      figuraTrace: 'C25',
      resultado,
      resultadosPaciente,
      atencion,
      paciente: paciente || atencion,
      scripts: ['/js/visor_resultados.js'],
    });
  } catch (err) {
    if (err.status === 404 || err.name === 'NoEncontrado') {
      return res.status(404).render('errores/404', {
        titulo: 'Resultado no encontrado',
        mensaje: err.message || 'No se encontró el resultado diagnóstico solicitado.',
        moduloActivo: 'resultados',
      });
    }
    return next(err);
  }
}

/**
 * GET /api/pacientes/:id/resultados
 * Retorna la lista de resultados de un paciente.
 */
async function apiResultadosPaciente(req, res, next) {
  try {
    const { id } = req.params;
    const ctx = db.ctxDe(req);
    const data = await resultadoService.listarResultadosPaciente(id, ctx);
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/resultados/:id
 * Retorna el detalle completo de un resultado diagnóstico.
 */
async function apiDetalleResultado(req, res, next) {
  try {
    const { id } = req.params;
    const ctx = db.ctxDe(req);
    const detalle = await resultadoService.obtenerDetalleResultado(id, ctx);
    return res.status(200).json({
      ok: true,
      data: {
        id: detalle.id,
        tipo: detalle.tipo,
        informe: detalle.informe,
        archivo: detalle.tiene_archivo,
        archivo_url: detalle.archivo_url,
        cargado_por: detalle.cargado_por,
        fecha: detalle.fecha_resultado,
        fecha_formateada: detalle.fecha_formateada,
        atencion_id: detalle.atencion_id,
        atencion_fecha: detalle.atencion_fecha,
        atencion_fecha_formateada: detalle.atencion_fecha_formateada,
        diagnostico: detalle.diagnostico,
        orden_id: detalle.orden_id,
        orden_codigo: detalle.orden_codigo,
        examen_principal: detalle.examen_principal,
        examenes: detalle.examenes,
        revisado: detalle.revisado,
        paciente_id: detalle.paciente_id,
      },
    });
  } catch (err) {
    if (err.status === 404 || err.name === 'NoEncontrado') {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: err.codigo || 'RESULTADO_NO_ENCONTRADO',
          mensaje: err.message || 'Resultado no encontrado',
        },
      });
    }
    return next(err);
  }
}

/**
 * GET /api/resultados/:id/archivo
 * Sirve el archivo físico adjunto de un resultado en streaming seguro.
 */
async function apiArchivoResultado(req, res, next) {
  try {
    const { id } = req.params;
    const ctx = db.ctxDe(req);
    const { filePath, filename, mimeType } = await resultadoService.obtenerArchivoSeguro(id, ctx);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => next(err));
    stream.pipe(res);
  } catch (err) {
    if (err.status === 404 || err.name === 'NoEncontrado') {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: err.codigo || 'ARCHIVO_NO_ENCONTRADO',
          mensaje: err.message || 'Archivo no encontrado',
        },
      });
    }
    return next(err);
  }
}

/**
 * PATCH /api/resultados/:id/revisado
 * Marca como revisado un resultado diagnóstico (notificación leída + auditoría).
 */
async function apiMarcarRevisado(req, res, next) {
  try {
    const { id } = req.params;
    const ctx = db.ctxDe(req);
    await resultadoService.marcarRevisado(id, ctx);
    return res.status(204).end();
  } catch (err) {
    if (err.status === 404 || err.name === 'NoEncontrado') {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: err.codigo || 'RESULTADO_NO_ENCONTRADO',
          mensaje: err.message || 'Resultado no encontrado',
        },
      });
    }
    return next(err);
  }
}

module.exports = {
  renderCarga,
  buscarOrden,
  guardarResultado,
  renderVisor,
  apiResultadosPaciente,
  apiDetalleResultado,
  apiArchivoResultado,
  apiMarcarRevisado,
};
