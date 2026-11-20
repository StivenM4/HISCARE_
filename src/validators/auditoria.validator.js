// src/validators/auditoria.validator.js — validación de filtros para bitácora de auditoría (C.26)

const ACCIONES_VALIDAS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'SELECT_CONFIDENTIAL',
  'LOGIN',
  'LOGIN_FALLIDO',
  'LOGOUT',
  'ACCESO_DENEGADO',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA_FORMATO_REGEX = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;
const MAX_DIAS_MS = 92 * 24 * 60 * 60 * 1000; // 92 días en milisegundos

/**
 * Middleware para validar filtros de consulta de la bitácora de auditoría.
 * Aplica para /api/auditoria, /api/auditoria/resumen y /api/auditoria/exportar.csv.
 */
function validarFiltros(req, res, next) {
  const campos = [];
  const { desde, hasta, usuario, accion, tabla, registro, cursor } = req.query;

  // Validación de 'desde'
  if (!desde || typeof desde !== 'string' || !desde.trim()) {
    campos.push({ campo: 'desde', mensaje: 'El parámetro desde es requerido' });
  } else if (!FECHA_FORMATO_REGEX.test(desde.trim()) || isNaN(new Date(desde.trim()).getTime())) {
    campos.push({ campo: 'desde', mensaje: 'El parámetro desde debe tener un formato de fecha válido (ISO, YYYY-MM-DD o YYYY-MM-DD HH:mm:ss)' });
  }

  // Validación de 'hasta'
  if (!hasta || typeof hasta !== 'string' || !hasta.trim()) {
    campos.push({ campo: 'hasta', mensaje: 'El parámetro hasta es requerido' });
  } else if (!FECHA_FORMATO_REGEX.test(hasta.trim()) || isNaN(new Date(hasta.trim()).getTime())) {
    campos.push({ campo: 'hasta', mensaje: 'El parámetro hasta debe tener un formato de fecha válido (ISO, YYYY-MM-DD o YYYY-MM-DD HH:mm:ss)' });
  }

  if (campos.length > 0) {
    return res.status(422).json({
      ok: false,
      error: {
        codigo: 'VALIDACION_FALLIDA',
        mensaje: campos[0].mensaje,
        campos,
      },
    });
  }

  const dDesde = new Date(desde.trim());
  const dHasta = new Date(hasta.trim());

  // Validación de rango de fechas
  if (dDesde.getTime() > dHasta.getTime()) {
    return res.status(422).json({
      ok: false,
      error: {
        codigo: 'RANGO_INVALIDO',
        mensaje: 'La fecha inicial (desde) no puede ser mayor que la fecha final (hasta)',
      },
    });
  }

  if (dHasta.getTime() - dDesde.getTime() > MAX_DIAS_MS) {
    return res.status(422).json({
      ok: false,
      error: {
        codigo: 'RANGO_INVALIDO',
        mensaje: 'El rango de consulta no puede superar 92 días',
      },
    });
  }

  // Validaciones de parámetros opcionales
  if (usuario && typeof usuario === 'string' && usuario.trim()) {
    if (!UUID_REGEX.test(usuario.trim())) {
      campos.push({ campo: 'usuario', mensaje: 'El parámetro usuario debe ser un UUID válido' });
    }
  }

  if (accion && typeof accion === 'string' && accion.trim()) {
    const accionNormalizada = accion.trim().toUpperCase();
    if (!ACCIONES_VALIDAS.includes(accionNormalizada)) {
      campos.push({
        campo: 'accion',
        mensaje: `La acción debe ser una de las siguientes: ${ACCIONES_VALIDAS.join(', ')}`,
      });
    }
  }

  if (tabla && typeof tabla === 'string' && tabla.trim()) {
    if (tabla.trim().length > 60) {
      campos.push({ campo: 'tabla', mensaje: 'El nombre de tabla no puede exceder 60 caracteres' });
    }
  }

  if (registro && typeof registro === 'string' && registro.trim()) {
    if (!UUID_REGEX.test(registro.trim())) {
      campos.push({ campo: 'registro', mensaje: 'El parámetro registro debe ser un UUID válido' });
    }
  }

  if (cursor && typeof cursor === 'string' && cursor.trim()) {
    let valorCursor = cursor.trim();
    if (!valorCursor.includes('|')) {
      try {
        valorCursor = Buffer.from(valorCursor, 'base64').toString('utf8');
      } catch {
        campos.push({ campo: 'cursor', mensaje: 'El cursor de paginación tiene un formato inválido' });
      }
    }
    if (!campos.some(c => c.campo === 'cursor')) {
      const partes = valorCursor.split('|');
      if (partes.length < 2 || isNaN(new Date(partes[0]).getTime()) || !UUID_REGEX.test(partes[1])) {
        campos.push({ campo: 'cursor', mensaje: 'El cursor de paginación debe contener una fecha válida y un UUID' });
      }
    }
  }

  if (campos.length > 0) {
    return res.status(422).json({
      ok: false,
      error: {
        codigo: 'VALIDACION_FALLIDA',
        mensaje: campos[0].mensaje,
        campos,
      },
    });
  }

  return next();
}

module.exports = {
  validarFiltros,
  ACCIONES_VALIDAS,
};
