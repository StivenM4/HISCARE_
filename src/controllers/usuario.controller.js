// src/controllers/usuario.controller.js — controlador para Pantalla C.12 (Administración de usuarios y roles)
const usuarioService = require('../services/usuario.service');
const db = require('../db');

/**
 * Renderiza la interfaz administrativa de gestión de usuarios y roles (C.12).
 * GET /admin/usuarios
 */
async function renderAdminUsuarios(req, res, next) {
  try {
    return res.render('admin/usuarios_admin', {
      titulo: 'Administración de usuarios y roles',
      moduloActivo: 'admin',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Retorna el listado paginado y filtrado de usuarios vía API.
 * GET /api/usuarios
 */
async function getUsuarios(req, res, next) {
  try {
    const { q, rol, activo, page, limite } = req.query;
    const resultado = await usuarioService.listar({ q, rol, activo, page, limite });

    return res.json({
      ok: true,
      data: {
        filas: resultado.filas,
        total: resultado.total,
        page: resultado.page,
        paginas: resultado.paginas,
      },
      filas: resultado.filas,
      total: resultado.total,
      page: resultado.page,
      paginas: resultado.paginas,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Retorna el catálogo de roles disponibles.
 * GET /api/roles
 */
async function getRoles(req, res, next) {
  try {
    const roles = await usuarioService.obtenerRoles();
    return res.json({
      ok: true,
      data: roles,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Crea un nuevo usuario institucional.
 * POST /api/usuarios
 */
async function postUsuario(req, res, next) {
  try {
    const ctx = db.ctxDe(req);
    const nuevo = await usuarioService.crear(req.body, ctx);

    return res.status(201).json({
      ok: true,
      id: nuevo.id,
      data: nuevo,
    });
  } catch (err) {
    if (err.codigo === 'CORREO_DUPLICADO' || err.code === '23505') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CORREO_DUPLICADO',
          mensaje: 'El correo electrónico ya se encuentra registrado en el sistema',
        },
      });
    }
    return next(err);
  }
}

/**
 * Actualiza los datos de un usuario existente.
 * PUT /api/usuarios/:id
 */
async function putUsuario(req, res, next) {
  try {
    const ctx = db.ctxDe(req);
    const usuarioSesion = req.session && req.session.usuario ? req.session.usuario : null;
    const actualizado = await usuarioService.actualizar(req.params.id, req.body, usuarioSesion, ctx);

    return res.status(200).json({
      ok: true,
      data: actualizado,
    });
  } catch (err) {
    if (err.codigo === 'CORREO_DUPLICADO' || err.code === '23505') {
      return res.status(409).json({
        ok: false,
        error: {
          codigo: 'CORREO_DUPLICADO',
          mensaje: 'El correo electrónico ya se encuentra registrado en el sistema',
        },
      });
    }

    if (err.codigo === 'AUTO_CAMBIO_ROL_NO_PERMITIDO') {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'AUTO_CAMBIO_ROL_NO_PERMITIDO',
          mensaje: err.message || 'El administrador no puede cambiar su propio rol',
        },
      });
    }

    if (err.codigo === 'USUARIO_NO_ENCONTRADO' || err.status === 404) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'USUARIO_NO_ENCONTRADO',
          mensaje: 'El usuario especificado no existe',
        },
      });
    }

    return next(err);
  }
}

/**
 * Activa o desactiva un usuario institucional.
 * PATCH /api/usuarios/:id/estado
 */
async function patchEstado(req, res, next) {
  try {
    const ctx = db.ctxDe(req);
    const usuarioSesion = req.session && req.session.usuario ? req.session.usuario : null;
    const resEstado = await usuarioService.cambiarEstado(req.params.id, req.body.activo, usuarioSesion, ctx);

    return res.status(200).json({
      ok: true,
      data: resEstado,
      activo: resEstado.activo,
    });
  } catch (err) {
    if (err.codigo === 'AUTO_DESACTIVACION_NO_PERMITIDA') {
      return res.status(422).json({
        ok: false,
        error: {
          codigo: 'AUTO_DESACTIVACION_NO_PERMITIDA',
          mensaje: err.message || 'El administrador no puede desactivarse a sí mismo',
        },
      });
    }

    if (err.codigo === 'USUARIO_NO_ENCONTRADO' || err.status === 404) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'USUARIO_NO_ENCONTRADO',
          mensaje: 'El usuario especificado no existe',
        },
      });
    }

    return next(err);
  }
}

/**
 * Consulta la matriz de permisos RBAC del sistema.
 * GET /api/permisos
 */
async function getPermisos(req, res, next) {
  try {
    const matriz = usuarioService.obtenerMatrizPermisos();

    return res.json({
      ok: true,
      data: matriz,
      modulos: matriz.modulos,
      roles: matriz.roles,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  renderAdminUsuarios,
  getUsuarios,
  getRoles,
  postUsuario,
  putUsuario,
  patchEstado,
  getPermisos,
};
