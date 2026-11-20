// src/middlewares/upload.js — Configuración de Multer y validación de firma mágica binaria (magic bytes)
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const {
  obtenerUploadDir,
  obtenerMaxUploadMb,
  obtenerMaxUploadBytes,
} = require('../config/entorno');

// Almacenamiento en disco con UUID aleatorio y extensión original en minúsculas
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const dir = obtenerUploadDir();
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const nombre = `${crypto.randomUUID()}${ext}`;
    cb(null, nombre);
  },
});

const MIMETYPES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const EXTENSIONES_PERMITIDAS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

// Filtro inicial por mimetype y extensión
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (!EXTENSIONES_PERMITIDAS.includes(ext) || !MIMETYPES_PERMITIDOS.includes(mime)) {
    const error = new Error('FORMATO_NO_PERMITIDO');
    error.codigo = 'FORMATO_NO_PERMITIDO';
    return cb(error, false);
  }
  cb(null, true);
}

/**
 * Valida los magic bytes reales del archivo en disco.
 * Retorna true si coincide con PDF, JPEG, PNG o WEBP; false si no.
 */
function verificarMagicBytes(filePath) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buffer, 0, 12, 0);

    if (bytesRead < 3) return false;

    // PDF: %PDF -> 0x25, 0x50, 0x44, 0x46
    if (
      bytesRead >= 4 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      return true;
    }

    // JPEG: 0xFF, 0xD8, 0xFF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return true;
    }

    // PNG: 0x89, 0x50, 0x4E, 0x47
    if (
      bytesRead >= 4 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return true;
    }

    // WEBP: RIFF (bytes 0-3) ... WEBP (bytes 8-11)
    if (
      bytesRead >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return true;
    }

    return false;
  } catch (err) {
    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (_) {}
    }
  }
}

/**
 * Middleware para la carga de archivo de resultado diagnóstico.
 * Maneja errores de tamaño (HTTP 413), formato no permitido (HTTP 415),
 * y firma binaria inconsistente (HTTP 415 con eliminación inmediata).
 */
function uploadMiddleware(req, res, next) {
  const maxMb = obtenerMaxUploadMb();
  const maxBytes = obtenerMaxUploadBytes();

  const uploadInstance = multer({
    storage,
    limits: {
      fileSize: maxBytes,
    },
    fileFilter,
  });

  const handler = uploadInstance.single('archivo');

  handler(req, res, (err) => {
    if (err) {
      // 1. Archivo excede tamaño máximo permitido
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          ok: false,
          error: {
            codigo: 'ARCHIVO_EXCEDE_TAMANO',
            mensaje: `El archivo excede el tamaño máximo permitido (${maxMb} MB)`,
          },
        });
      }

      // 2. Formato rechazado por fileFilter
      if (err.codigo === 'FORMATO_NO_PERMITIDO' || err.message === 'FORMATO_NO_PERMITIDO') {
        return res.status(415).json({
          ok: false,
          error: {
            codigo: 'FORMATO_NO_PERMITIDO',
            mensaje: 'El archivo no tiene un formato válido (solo PDF, JPG o PNG) (HIS-E-08)',
          },
        });
      }

      // Otro error de multer
      return res.status(400).json({
        ok: false,
        error: {
          codigo: 'ERROR_SUBIDA',
          mensaje: err.message || 'Error al procesar el archivo subido',
        },
      });
    }

    // Si no se adjuntó archivo, continúa (la orden puede cargarse solo con informe de texto)
    if (!req.file) {
      return next();
    }

    // 3. Verificación de firma mágica binaria (magic bytes)
    const archivoValido = verificarMagicBytes(req.file.path);
    if (!archivoValido) {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (unlinkErr) {
        console.error('Error al eliminar archivo inválido:', unlinkErr);
      }

      return res.status(415).json({
        ok: false,
        error: {
          codigo: 'FORMATO_NO_PERMITIDO',
          mensaje: 'El archivo no tiene un formato válido (solo PDF, JPG o PNG) (HIS-E-08)',
        },
      });
    }

    return next();
  });
}

module.exports = uploadMiddleware;
Object.defineProperty(uploadMiddleware, 'UPLOAD_DIR', {
  get: () => obtenerUploadDir(),
  enumerable: true,
  configurable: true,
});
module.exports.UPLOAD_DIR = obtenerUploadDir();
module.exports.verificarMagicBytes = verificarMagicBytes;
module.exports.obtenerUploadDir = obtenerUploadDir;
