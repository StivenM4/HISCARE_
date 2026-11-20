// src/controllers/orden.controller.js — Controlador para pantalla C.7, C.8 y C.10 (Órdenes diagnósticas)
const db = require('../db');
const { traducir, NoEncontrado, ErrorValidacion } = require('../db/errores');
const atencionService = require('../services/atencion.service');
const ordenService = require('../services/orden.service');
const { obtenerOrdenVigenciaDias } = require('../config/entorno');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lista general y seguimiento de órdenes diagnósticas (GET /ordenes y GET /api/ordenes - Pantalla C.10).
 * Soporta filtros por rango de fechas (por defecto ayer-hoy), tipo, estado, código o búsqueda de texto.
 */
async function listarOrdenes(req, res, next) {
  try {
    const atencionId = req.query.atencion || req.query.atencion_id || null;
    const pacienteId = req.query.paciente || req.query.paciente_id || null;
    const modo = req.query.modo || null;

    // Si viene modo de gestión directa hacia la atención clínica
    if (atencionId && UUID_REGEX.test(atencionId) && (modo === 'gestion' || modo === 'nueva')) {
      return res.redirect(`/atenciones/${atencionId}/ordenes`);
    }

    const ctx = db.ctxDe(req);
    const usuario = req.session && req.session.usuario;
    const desde = req.query.desde || null;
    const hasta = req.query.hasta || null;
    const tipo = req.query.tipo || null;
    const estado = req.query.estado || null;
    const codigo = req.query.codigo || req.query.q || req.query.buscar || null;
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const limite = req.query.limite ? parseInt(req.query.limite, 10) : 20;

    // Si la petición es API (req.xhr o header accept application/json o ruta /api/)
    const esApi = Boolean(
      req.xhr ||
      (req.accepts('json') && !req.accepts('html')) ||
      (req.originalUrl && req.originalUrl.startsWith('/api/'))
    );

    if (esApi) {
      try {
        const resultado = await ordenService.listarOrdenesC10(
          { desde, hasta, tipo, estado, codigo, page, limite, usuario },
          ctx
        );

        const tieneQueryParams = Boolean(
          req.query.desde ||
          req.query.hasta ||
          req.query.page ||
          req.query.tipo ||
          req.query.estado ||
          req.query.codigo ||
          req.query.q ||
          req.query.buscar
        );

        if (!tieneQueryParams) {
          return res.json({
            ok: true,
            data: resultado.filas,
            resumen: resultado.resumen,
            filas: resultado.filas,
            total: resultado.total,
            page: resultado.page,
            limite: resultado.limite
          });
        }

        return res.json({
          ok: true,
          data: {
            resumen: resultado.resumen,
            filas: resultado.filas,
            total: resultado.total,
            page: resultado.page,
            limite: resultado.limite
          },
          resumen: resultado.resumen,
          filas: resultado.filas,
          total: resultado.total,
          page: resultado.page
        });
      } catch (err) {
        if (
          err instanceof ErrorValidacion ||
          err.status === 422 ||
          err.codigo === 'FECHAS_INVALIDAS' ||
          err.codigo === 'VALIDACION_FALLIDA'
        ) {
          return res.status(422).json({
            ok: false,
            error: {
              codigo: 'FECHAS_INVALIDAS',
              mensaje: err.message,
              campos: err.campos || []
            }
          });
        }
        return next(err);
      }
    }

    // Renderizado de la vista HTML (GET /ordenes)
    let resultado;
    try {
      resultado = await ordenService.listarOrdenesC10(
        { desde, hasta, tipo, estado, codigo, page, limite, usuario },
        ctx
      );
    } catch (err) {
      if (err instanceof ErrorValidacion || err.status === 422) {
        const def = ordenService.obtenerAyerYHoyBogota();
        resultado = await ordenService.listarOrdenesC10(
          { desde: def.desde, hasta: def.hasta, tipo, estado, codigo, page: 1, limite, usuario },
          ctx
        );
        resultado.alertaError = err.message;
      } else {
        throw err;
      }
    }

    return res.render('ordenes/ordenes_listado', {
      titulo: 'Gestión de órdenes médicas - HISCARE',
      moduloActivo: 'ordenes',
      figuraTrace: 'C10',
      usuario,
      resumen: resultado.resumen,
      filas: resultado.filas,
      ordenes: resultado.filas,
      total: resultado.total,
      page: resultado.page,
      limite: resultado.limite,
      desde: resultado.desde,
      hasta: resultado.hasta,
      tipo: resultado.tipo,
      estado: resultado.estado,
      codigo: resultado.codigo,
      scripts: ['/js/ordenes_listado.js'],
      filtroAtencion: atencionId,
      atencion: atencionId,
      filtroPaciente: pacienteId,
      paciente: pacienteId,
      filtroTipo: resultado.tipo,
      filtroEstado: resultado.estado,
      filtroQ: codigo || '',
      q: codigo || '',
      alertaError: resultado.alertaError || null
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Renderiza la pestaña Órdenes de la atención clínica (C.7).
 * GET /atenciones/:id/ordenes
 */
async function renderOrdenNueva(req, res, next) {
  try {
    const ctx = db.ctxDe(req);
    let atencion = res.locals.atencion || req.atencion;

    if (!atencion) {
      try {
        atencion = await atencionService.cargar(req.params.id, ctx);
      } catch (_) {
        atencion = null;
      }
    }

    if (!atencion) {
      return res.status(404).render('errores/404', {
        titulo: 'Atención no encontrada',
        mensaje: 'La atención clínica solicitada no existe.',
        moduloActivo: 'atenciones',
      });
    }

    const usuario = req.session && req.session.usuario;
    const atencionId = atencion.id;

    // Obtener diagnóstico principal que justifica la orden
    const diagnostico = await ordenService.obtenerDiagnosticoPrincipal(atencionId);

    // Obtener órdenes previamente emitidas en esta atención
    const ordenes = await ordenService.listarOrdenesPorAtencion(atencionId);

    // Determinar permisos y estado de edición
    const esAdmin = Boolean(usuario && usuario.rol === 'ADMINISTRADOR');
    const soloLectura = Boolean(
      res.locals.soloLectura ||
      atencion.estado === 'CERRADA' ||
      !usuario ||
      (!esAdmin && (usuario.rol !== 'MEDICO' || (atencion.medico_id && usuario.id && atencion.medico_id !== usuario.id)))
    );

    const puedeEditar = Boolean(
      usuario &&
      atencion.estado !== 'CERRADA' &&
      (esAdmin || (usuario.rol === 'MEDICO' && (!atencion.medico_id || atencion.medico_id === usuario.id)))
    );

    return res.render('ordenes/orden_nueva', {
      titulo: 'Órdenes diagnósticas - HISCARE',
      atencion,
      diagnostico,
      ordenes,
      soloLectura,
      puedeEditar,
      seccion: 'ordenes',
      figuraTrace: 'C7',
      moduloActivo: 'atenciones',
      usuario,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Lista las órdenes diagnósticas asociadas a una atención clínica en formato JSON (C.7).
 * GET /api/atenciones/:id/ordenes
 */
async function apiListarOrdenesAtencion(req, res, next) {
  try {
    const atencion = req.atencion || res.locals.atencion;
    const atencionId = (atencion && atencion.id) || req.params.id;
    const ordenes = await ordenService.listarOrdenesPorAtencion(atencionId);
    return res.json({ ok: true, data: ordenes });
  } catch (err) {
    return next(err);
  }
}

/**
 * Autocompletado y búsqueda en catálogo CUPS (C.7).
 * GET /api/cups/buscar?q=...
 */
async function apiBuscarCups(req, res, next) {
  try {
    const q = req.query.q || '';
    const tipo = req.query.tipo || null;
    const resultados = await ordenService.buscarCups(q, tipo);
    return res.json({ ok: true, data: resultados });
  } catch (err) {
    return next(err);
  }
}

/**
 * Emisión de orden diagnóstica con detalle CUPS e integración (C.7).
 * POST /api/atenciones/:id/ordenes
 */
async function apiCrearOrden(req, res, next) {
  try {
    const atencion = req.atencion || res.locals.atencion;
    if (atencion && atencion.estado === 'CERRADA') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CERRADA',
          mensaje: 'No se pueden emitir órdenes en una atención que ya está cerrada'
        }
      });
    }

    const usuario = req.session && req.session.usuario;
    const esAdmin = Boolean(usuario && usuario.rol === 'ADMINISTRADOR');
    if (usuario && !esAdmin && usuario.rol !== 'MEDICO') {
      return res.status(403).json({
        ok: false,
        error: { codigo: 'ROL_NO_PERMITIDO', mensaje: 'Acción reservada a médicos o administradores' }
      });
    }

    const ctx = db.ctxDe(req);
    const atencionId = req.params.id;
    const resultado = await ordenService.crearOrden(atencionId, req.body, ctx);
    return res.status(201).json({
      ok: true,
      data: {
        orden_id: resultado.orden_id,
        codigo: resultado.codigo,
        fecha: resultado.fecha
      }
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        ok: false,
        error: {
          codigo: err.codigo || 'ERROR_OPERACION',
          mensaje: err.message,
          campos: err.campos || []
        }
      });
    }
    const t = traducir(err);
    if (t) {
      return res.status(t.status).json({ ok: false, error: t.error });
    }
    return next(err);
  }
}

/**
 * Vista de impresión de orden diagnóstica (C.8).
 * GET /ordenes/:id/imprimir
 * Alias: GET /ordenes/:id/impresion
 */
async function renderImprimir(req, res, next) {
  try {
    const ctx = db.ctxDe(req);
    const ordenIdOCodigo = req.params.id;
    const datos = await ordenService.cargarOrdenImpresion(ordenIdOCodigo, ctx);

    const esApi = Boolean(
      req.xhr ||
      (req.accepts('json') && !req.accepts('html')) ||
      (req.originalUrl && req.originalUrl.startsWith('/api/'))
    );

    if (esApi) {
      return res.json({ ok: true, data: datos });
    }

    return res.render('ordenes/orden_impresion', {
      ...datos,
      orden: datos.orden,
      paciente: datos.paciente,
      medico: datos.medico,
      detalle: datos.detalle,
      vigenciaDias: datos.vigenciaDias,
      fechaVigencia: datos.fechaVigencia,
      fechaVigenciaTexto: datos.fechaVigenciaTexto,
      instrucciones: datos.instrucciones
    });
  } catch (err) {
    const esApi = Boolean(
      req.xhr ||
      (req.accepts('json') && !req.accepts('html')) ||
      (req.originalUrl && req.originalUrl.startsWith('/api/'))
    );

    if (err instanceof NoEncontrado || err.status === 404 || err.name === 'NoEncontrado' || err.codigo === 'NO_ENCONTRADO' || err.codigo === 'ORDEN_NO_ENCONTRADA') {
      if (esApi) {
        return res.status(404).json({
          ok: false,
          error: { codigo: 'NO_ENCONTRADO', mensaje: err.message || 'Orden no encontrada' }
        });
      }
      return res.status(404).render('errores/404', {
        titulo: 'Orden no encontrada',
        mensaje: 'La orden médica solicitada no existe o no se encuentra disponible.',
        moduloActivo: 'ordenes',
      });
    }

    const httpErr = traducir(err);
    if (httpErr && httpErr.status === 404) {
      if (esApi) {
        return res.status(404).json({ ok: false, error: httpErr.error });
      }
      return res.status(404).render('errores/404', {
        titulo: 'Orden no encontrada',
        mensaje: 'La orden médica solicitada no existe o no se encuentra disponible.',
        moduloActivo: 'ordenes',
      });
    }

    return next(err);
  }
}

module.exports = {
  listarOrdenes,
  renderOrdenNueva,
  renderOrden: renderOrdenNueva,
  apiListarOrdenesAtencion,
  apiBuscarCups,
  buscarCups: apiBuscarCups,
  apiCrearOrden,
  crearOrden: apiCrearOrden,
  renderImprimir,
  imprimir: renderImprimir,
  obtenerOrdenVigenciaDias,
};
