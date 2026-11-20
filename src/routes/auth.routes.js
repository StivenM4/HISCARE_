// src/routes/auth.routes.js — C.1 inicio de sesión, C.27 sesión expirada, aviso de soporte y cambio de clave
const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const { sesion } = require('../middlewares/seguridad');
const {
  reglasLogin,
  reglasCambiarClave,
  validar,
} = require('../validators/auth.validator');

// Rate limiting: 5 intentos de inicio de sesión en 15 minutos por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados intentos de inicio de sesión. Por favor espere 15 minutos.',
  handler: (req, res) => {
    if (typeof authController.rateLimited === 'function') {
      return authController.rateLimited(req, res);
    }
    const mensaje = 'Demasiados intentos de inicio de sesión. Por favor espere 15 minutos.';
    const esApi =
      req.originalUrl.startsWith('/api/') ||
      req.xhr ||
      (req.headers.accept && req.headers.accept.includes('application/json')) ||
      (req.headers['content-type'] && req.headers['content-type'].includes('application/json'));

    if (esApi) {
      return res.status(429).json({
        ok: false,
        error: {
          codigo: 'DEMASIADOS_INTENTOS',
          mensaje,
        },
      });
    }

    return res.status(429).render('auth/login', {
      error: mensaje,
      next: req.body.next || '',
      expirada: false,
    });
  },
});

// Rutas de inicio de sesión y sesión expirada
router.get('/login', authController.renderLogin);
router.get('/sesion-expirada', authController.renderSesionExpirada);
router.post('/login', loginLimiter, validar(reglasLogin), authController.login);

// Ruta de cierre de sesión
router.post('/logout', sesion, authController.logout);

// Pantalla informativa de soporte para restablecimiento de contraseña vía ticket/Sistemas
router.get('/recuperar', authController.renderRecuperar);

// Rutas de cambio obligatorio / voluntario de contraseña
router.get('/cambiar-clave', sesion, authController.renderCambiarClave);
router.post('/cambiar-clave', sesion, validar(reglasCambiarClave), authController.cambiarClave);

module.exports = router;
