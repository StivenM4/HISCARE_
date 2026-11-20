// src/config/entorno.js — Módulo centralizado de configuración de variables de entorno y límites de la aplicación
const path = require('path');

/**
 * Obtiene el directorio absoluto configurado para almacenar archivos adjuntos de resultados diagnósticos.
 * Si process.env.UPLOAD_DIR está vacío, utiliza por defecto: path.resolve(process.cwd(), 'uploads', 'resultados').
 * Si se especifica una ruta relativa, se resuelve de manera segura respecto a process.cwd().
 *
 * @returns {string} Ruta absoluta del directorio de uploads
 */
function obtenerUploadDir() {
  const dirEnv = (process.env.UPLOAD_DIR || '').trim();
  if (!dirEnv) {
    return path.resolve(process.cwd(), 'uploads', 'resultados');
  }
  return path.isAbsolute(dirEnv) ? dirEnv : path.resolve(process.cwd(), dirEnv);
}

/**
 * Obtiene el límite máximo de tamaño de archivo subido en Megabytes (MB).
 * Lee process.env.MAX_UPLOAD_MB; si es inválido, NaN o <= 0, aplica fallback seguro a 10 (HIS-F-29 / HIS-E-08).
 *
 * @returns {number} Límite en Megabytes
 */
function obtenerMaxUploadMb() {
  const parsed = parseInt(process.env.MAX_UPLOAD_MB, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return 10;
  }
  return parsed;
}

/**
 * Obtiene el límite máximo de subida en bytes para Multer y validadores de stream.
 *
 * @returns {number} Límite en bytes
 */
function obtenerMaxUploadBytes() {
  return obtenerMaxUploadMb() * 1024 * 1024;
}

/**
 * Obtiene los días de vigencia de una orden médica diagnóstica (paso 7.3 del brief / Anexo L).
 * Lee process.env.ORDEN_VIGENCIA_DIAS; si es inválido, NaN o <= 0, aplica fallback seguro a 30 días.
 *
 * @returns {number} Días de vigencia
 */
function obtenerOrdenVigenciaDias() {
  const parsed = parseInt(process.env.ORDEN_VIGENCIA_DIAS, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return 30;
  }
  return parsed;
}

module.exports = {
  obtenerUploadDir,
  obtenerMaxUploadMb,
  obtenerMaxUploadBytes,
  obtenerOrdenVigenciaDias,
};
