// src/controllers/notificacion.controller.js — Controlador de notificaciones y alertas clínicas (Pantalla C.11)
const notificacionService = require('../services/notificacion.service');
const { NoEncontrado } = require('../db/errores');

/**
 * GET /api/notificaciones/no-leidas/conteo
 * Retorna el número de notificaciones pendientes de lectura del usuario autenticado.
 */
async function getConteo(req, res, next) {
  try {
    const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
    const { conteo } = await notificacionService.conteoNoLeidas(usuarioId);
    return res.json({
      ok: true,
      data: { conteo },
      conteo
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/notificaciones
 * Consulta paginada y filtrable de notificaciones del usuario autenticado.
 */
async function getNotificaciones(req, res, next) {
  try {
    const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
    const limite = req.query.limite || req.query.limit;
    const pagina = req.query.pagina || req.query.page;
    let leido = req.query.leido;
    let prioridad = req.query.prioridad;
    if (req.query.filtro === 'no_leidas' && leido === undefined) {
      leido = false;
    } else if (req.query.filtro === 'criticas' && !prioridad) {
      prioridad = 'CRITICA';
    }

    const resultado = await notificacionService.listarNotificaciones(usuarioId, {
      limite,
      pagina,
      leido,
      prioridad
    });

    return res.json({
      ok: true,
      data: resultado.notificaciones,
      meta: {
        total: resultado.total,
        pagina: resultado.pagina,
        totalPaginas: resultado.totalPaginas
      }
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/notificaciones/:id/leida
 * Marca una notificación individual como leída.
 * Retorna 204 No Content en éxito o 404 si no existe/no pertenece al usuario.
 */
async function marcarLeida(req, res, next) {
  try {
    const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
    const { id } = req.params;

    await notificacionService.marcarLeida(id, usuarioId);
    return res.status(204).send();
  } catch (err) {
    if (
      err instanceof NoEncontrado ||
      err.status === 404 ||
      err.codigo === 'NOT_FOUND' ||
      err.codigo === 'NO_ENCONTRADO'
    ) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'NOT_FOUND',
          mensaje: err.message || 'Notificación no encontrada o no pertenece al usuario'
        }
      });
    }
    return next(err);
  }
}

/**
 * PATCH /api/notificaciones/leidas
 * Marca todas las notificaciones pendientes del usuario como leídas.
 * Retorna 204 No Content.
 */
async function marcarTodasLeidas(req, res, next) {
  try {
    const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
    await notificacionService.marcarTodasLeidas(usuarioId);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /notificaciones
 * Renderiza la pantalla principal del Centro de notificaciones y alertas clínicas (C.11).
 */
async function renderListado(req, res, next) {
  try {
    const usuario = req.session && req.session.usuario;
    const usuarioId = usuario ? usuario.id : null;
    const limite = req.query.limite ? parseInt(req.query.limite, 10) : 10;
    const pagina = req.query.pagina || req.query.page ? parseInt(req.query.pagina || req.query.page, 10) : 1;
    let leido = req.query.leido !== undefined ? req.query.leido : null;
    let prioridad = req.query.prioridad || null;
    const filtro = req.query.filtro || null;

    if (filtro === 'no_leidas' && leido === null) {
      leido = false;
    } else if (filtro === 'criticas' && !prioridad) {
      prioridad = 'CRITICA';
    }

    const resultado = await notificacionService.listarNotificaciones(usuarioId, {
      limite,
      pagina,
      leido,
      prioridad
    });

    return res.render('notificaciones/listado', {
      titulo: 'Notificaciones y Alertas Clínicas',
      moduloActivo: 'notificaciones',
      figuraTrace: 'C11',
      usuario,
      notificaciones: resultado.notificaciones,
      meta: {
        total: resultado.total,
        pagina: resultado.pagina,
        totalPaginas: resultado.totalPaginas,
        limite: resultado.limite
      },
      total: resultado.total,
      pagina: resultado.pagina,
      totalPaginas: resultado.totalPaginas,
      limite: resultado.limite,
      filtro,
      filtroLeido: leido,
      filtroPrioridad: prioridad,
      scripts: ['/js/notificaciones.js']
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getConteo,
  getNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  renderListado
};
