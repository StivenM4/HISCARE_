// src/controllers/antecedente.controller.js — controlador para la pestaña Antecedentes (C.5) y API de historias
const db = require('../db');
const { traducir } = require('../db/errores');
const atencionService = require('../services/atencion.service');
const antecedenteService = require('../services/antecedente.service');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Renderiza la pestaña Antecedentes (C.5).
 * - Llamado por GET /atenciones/:id/antecedentes con middlewares sesion, autorizar('atenciones', 'L'), cargarAtencion
 * - Audita la consulta de la historia clínica
 * - Obtiene antecedentes agrupados por tipo
 * - Determina soloLectura y puedeEditar (MEDICO: puede editar; ENFERMERO: solo lectura)
 */
async function renderAntecedentes(req, res, next) {
  try {
    let atencion = res.locals.atencion;
    try {
      const atencionCargada = await atencionService.cargar(req.params.id, db.ctxDe(req));
      if (atencionCargada) {
        atencion = atencionCargada;
      }
    } catch (_) {
      // Si falla la carga extendida, se utiliza el objeto atencion del middleware cargarAtencion
    }

    if (!atencion) {
      return res.status(404).render('errores/404', {
        titulo: 'Atención no encontrada',
        mensaje: 'La atención clínica solicitada no fue encontrada.',
        moduloActivo: 'atenciones',
      });
    }

    const historiaId = atencion.historia_id || (res.locals.atencion && res.locals.atencion.historia_id);
    if (!historiaId) {
      return res.status(404).render('errores/404', {
        titulo: 'Historia clínica no encontrada',
        mensaje: 'La atención clínica no está asociada a una historia clínica válida.',
        moduloActivo: 'atenciones',
      });
    }

    // Auditar consulta confidencial sobre la historia clínica
    await antecedenteService.auditarConsultaHistoria(historiaId, db.ctxDe(req));

    // Obtener antecedentes agrupados por tipo (claves Patologico, Quirurgico, Alergico, etc.)
    const antecedentesAgrupados = await antecedenteService.listarAgrupadosPorHistoria(historiaId);

    // Permisos y estados
    const usuario = req.session && req.session.usuario;
    const rol = usuario ? usuario.rol : null;
    const esMedicoOAdmin = (rol === 'MEDICO' || rol === 'ADMINISTRADOR');

    // Determina soloLectura: si res.locals.soloLectura o si el usuario no es MEDICO/ADMINISTRADOR o si atencion está cerrada
    const soloLectura = Boolean(
      res.locals.soloLectura || !esMedicoOAdmin || atencion.estado === 'CERRADA'
    );

    // Para la pestaña antecedentes, la edición está permitida a MEDICO y ADMINISTRADOR (E), mientras que ENFERMERO es (L)
    const puedeEditar = esMedicoOAdmin;

    return res.render('atencion/antecedentes', {
      titulo: 'Antecedentes',
      atencion,
      historiaId,
      antecedentesAgrupados,
      soloLectura,
      puedeEditar,
      seccion: 'antecedentes',
      moduloActivo: 'atenciones',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Lista antecedentes clínicos de una historia (GET /api/historias/:id/antecedentes).
 * Filtra opcionalmente por query parameter `tipo`.
 */
async function apiListarAntecedentes(req, res, next) {
  try {
    const historiaId = req.params.id;
    if (!historiaId || !UUID_REGEX.test(historiaId)) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'HISTORIA_NO_ENCONTRADA',
          mensaje: 'Historia clínica no encontrada',
        },
      });
    }

    const { rows: [historia] } = await db.query(
      'SELECT id FROM historias_clinicas WHERE id = $1',
      [historiaId]
    );
    if (!historia) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'HISTORIA_NO_ENCONTRADA',
          mensaje: 'Historia clínica no encontrada',
        },
      });
    }

    const tipo = req.query.tipo ? String(req.query.tipo).trim() : null;
    const antecedentes = await antecedenteService.listarPorHistoria(historiaId, tipo);

    return res.json({
      ok: true,
      data: antecedentes,
    });
  } catch (err) {
    const t = traducir(err);
    if (t) return res.status(t.status).json({ ok: false, error: t.error });
    return next(err);
  }
}

/**
 * Registra un nuevo antecedente en una historia clínica (POST /api/historias/:id/antecedentes).
 * Requiere rol MEDICO y datos validados.
 * Retorna el registro creado y la lista actualizada de alergias para refrescar el banner.
 */
async function apiCrearAntecedente(req, res, next) {
  try {
    const usuario = req.session && req.session.usuario;
    const rol = usuario ? usuario.rol : null;
    if (rol !== 'MEDICO' && rol !== 'ADMINISTRADOR') {
      return res.status(403).json({
        ok: false,
        error: {
          codigo: 'ROL_NO_PERMITIDO',
          mensaje: 'Acción reservada a MEDICO o ADMINISTRADOR',
        },
      });
    }

    const historiaId = req.params.id;
    if (!historiaId || !UUID_REGEX.test(historiaId)) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'HISTORIA_NO_ENCONTRADA',
          mensaje: 'Historia clínica no encontrada',
        },
      });
    }

    const { rows: [historia] } = await db.query(
      'SELECT id FROM historias_clinicas WHERE id = $1',
      [historiaId]
    );
    if (!historia) {
      return res.status(404).json({
        ok: false,
        error: {
          codigo: 'HISTORIA_NO_ENCONTRADA',
          mensaje: 'Historia clínica no encontrada',
        },
      });
    }

    const { tipo, descripcion } = req.body;
    const ctx = db.ctxDe(req);

    const nuevo = await antecedenteService.crearAntecedente({
      historiaId,
      tipo: String(tipo).trim(),
      descripcion: String(descripcion).trim(),
      ctx,
    });

    // Obtener lista actualizada de alergias de la historia para el banner
    const listaAlergias = await antecedenteService.obtenerAlergiasTexto(historiaId);

    return res.status(201).json({
      ok: true,
      data: {
        id: nuevo.id,
        tipo: nuevo.tipo,
        descripcion: nuevo.descripcion,
        fecha_creacion: nuevo.fecha_creacion,
        fecha_formateada: nuevo.fecha_formateada,
        alergias: listaAlergias,
      },
    });
  } catch (err) {
    const t = traducir(err);
    if (t) return res.status(t.status).json({ ok: false, error: t.error });
    return next(err);
  }
}

module.exports = {
  renderAntecedentes,
  apiListarAntecedentes,
  apiCrearAntecedente,
};
