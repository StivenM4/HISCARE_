// src/app.js — arranque de Express (sesión en PostgreSQL, helmet, EJS, errores 503)
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const db = require('./db');
const { sesion, autorizar, locals, verificarCsrf } = require('./middlewares/seguridad');
const { inicioPorRol } = require('./config/permisos');
const { obtenerUploadDir } = require('./config/entorno');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);                       // detrás de Nginx (req.ip real, cookie secure)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  frameguard: { action: 'sameorigin' },
  dnsPrefetchControl: { allow: false },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/bootstrap', express.static(path.join(__dirname, '..', 'node_modules', 'bootstrap', 'dist')));
app.use('/vendor/jquery', express.static(path.join(__dirname, '..', 'node_modules', 'jquery', 'dist')));
app.use('/vendor/select2', express.static(path.join(__dirname, '..', 'node_modules', 'select2', 'dist')));
app.use('/vendor/select2-bootstrap-5-theme', express.static(path.join(__dirname, '..', 'node_modules', 'select2-bootstrap-5-theme', 'dist')));
app.use('/vendor/datatables.net/js', express.static(path.join(__dirname, '..', 'node_modules', 'datatables.net', 'js')));
app.use('/vendor/datatables.net-bs5/css', express.static(path.join(__dirname, '..', 'node_modules', 'datatables.net-bs5', 'css')));
app.use('/vendor/datatables.net-bs5/js', express.static(path.join(__dirname, '..', 'node_modules', 'datatables.net-bs5', 'js')));
app.use('/vendor/sweetalert2', express.static(path.join(__dirname, '..', 'node_modules', 'sweetalert2', 'dist')));

app.use(session({
  store: new PgSession({ pool: db.pool, schemaName: 'infra', tableName: 'session' }),
  name: 'hiscare.sid',
  secret: process.env.SESSION_SECRET || 'cambiar-en-.env',
  resave: false,
  saveUninitialized: false,
  rolling: true,                                  // 15 min desde la última actividad (HIS-NF-06)
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true' ? true : (process.env.COOKIE_SECURE === 'false' ? false : 'auto'),
    maxAge: 15 * 60 * 1000,
  },
}));
app.use(locals);
app.use(verificarCsrf);

// Trazabilidad y prevención de Path Traversal para descarga de archivos clínicos adjuntos (C.25 - CA-03)
const auditoriaUploads = (req, res, next) => {
  if (req.path.includes('..') || req.path.includes('\0')) {
    return res.status(400).json({
      ok: false,
      error: { codigo: 'RUTA_INVALIDA', mensaje: 'Ruta de archivo no válida' },
    });
  }
  const ctx = db.ctxDe(req);
  if (ctx && ctx.usuarioId) {
    db.tx(ctx, async (c) => {
      await c.query("SELECT fn_auditar_consulta('resultados_diagnosticos', NULL, $1)", ['Acceso archivo adjunto: ' + req.path]);
    }).catch(() => {});
  }
  next();
};

// Configuración segura de archivos estáticos para descargas clínicas adjuntas (C.25 - CA-03)
const staticUploadsConfig = {
  dotfiles: 'deny',
  index: false,
  fallthrough: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  },
};

// Protección de archivos adjuntos (C.25 - CA-03): requiere sesión activa y permiso de resultados
app.use(
  '/uploads/resultados',
  sesion,
  autorizar('resultados', 'L'),
  auditoriaUploads,
  (req, res, next) => {
    express.static(obtenerUploadDir(), staticUploadsConfig)(req, res, next);
  }
);

app.use(
  '/uploads',
  sesion,
  autorizar('resultados', 'L'),
  auditoriaUploads,
  express.static(path.join(__dirname, '..', 'uploads'), staticUploadsConfig)
);


app.use(require('./routes/inicio.routes'));
app.use(require('./routes/busqueda.routes'));
app.use('/auth', require('./routes/auth.routes'));
app.use(require('./routes/citas.routes'));
app.use(require('./routes/atenciones.routes'));
app.use(require('./routes/historias.routes'));
app.use(require('./routes/pacientes.routes'));
app.use(require('./routes/aseguradoras.routes'));
app.use(require('./routes/ordenes.routes'));
app.use(require('./routes/catalogos.routes'));
app.use(require('./routes/notificaciones.routes'));
app.use(require('./routes/admin.routes'));
app.use(require('./routes/resultados.routes'));
app.use(require('./routes/auditoria.routes'));

if (process.env.NODE_ENV !== 'production') {
  app.use(require('./mock/lis.routes'));
}

app.use(require('./routes/health.routes'));

// Manejador final de errores: nunca expone detalles técnicos ni stack al cliente (HIS-E-12)
const manejadorErrores = require('./middlewares/errores');
app.use(manejadorErrores);

const { iniciarJobNotificaciones } = require('./jobs/notificaciones.job');
const { iniciarJobDespacho } = require('./jobs/despacho.job');
app.iniciarJobNotificaciones = iniciarJobNotificaciones;
app.iniciarJobDespacho = iniciarJobDespacho;

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  iniciarJobNotificaciones();
  iniciarJobDespacho();
  app.listen(PORT, '127.0.0.1', () => console.log('HISCARE en 127.0.0.1:' + PORT));
}
module.exports = app;
