// src/middlewares/errores.js — manejador de errores de final de cadena (Pantalla C.27, HIS-E-12)

const esApi = (req) =>
  Boolean(
    (req.originalUrl && req.originalUrl.startsWith('/api/')) ||
    req.xhr ||
    (req.path && req.path.startsWith('/api/'))
  );

/**
 * Genera un código de incidente según la especificación:
 * 'INC-' + AAAAMMDD + '-' + HHmm + '-' + 4 caracteres aleatorios alfanuméricos en mayúscula
 * Ejemplo: INC-20261016-1505-AB12
 */
function generarCodigoIncidente(fecha = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = fecha.getFullYear();
  const mm = pad(fecha.getMonth() + 1);
  const dd = pad(fecha.getDate());
  const hh = pad(fecha.getHours());
  const min = pad(fecha.getMinutes());

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `INC-${yyyy}${mm}${dd}-${hh}${min}-${rand}`;
}

/**
 * Middleware final de manejo de errores de Express.
 * NUNCA expone detalles técnicos ni stack trace al cliente (HIS-E-12).
 * Si es API: HTTP 503 JSON { ok: false, error: { codigo: 'SERVICIO_NO_DISPONIBLE', incidente } }
 * Si es navegador: HTTP 503 render 'errores/503' con { incidente }
 */
function manejadorErrores(err, req, res, next) { // eslint-disable-line no-unused-vars
  const incidente = generarCodigoIncidente();
  console.error(incidente, err);

  if (res.headersSent) {
    return next(err);
  }

  if (esApi(req)) {
    return res.status(503).json({
      ok: false,
      error: {
        codigo: 'SERVICIO_NO_DISPONIBLE',
        incidente,
      },
    });
  }

  return res.status(503).render('errores/503', { incidente });
}

manejadorErrores.generarCodigoIncidente = generarCodigoIncidente;

module.exports = manejadorErrores;
