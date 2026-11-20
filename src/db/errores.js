// src/db/errores.js — traduce errores de PostgreSQL a respuestas HTTP (sin exponer SQL)
const MAPA = {
  '23505': [409, 'DUPLICADO', 'El registro ya existe'],
  '23P01': [409, 'CRUCE_HORARIO', 'La franja ya fue tomada por otro usuario'],
  '23514': [422, 'FUERA_DE_RANGO', 'Un valor no cumple las reglas permitidas'],
  '23503': [422, 'REFERENCIA_INVALIDA', 'Se referencia un registro inexistente'],
  'P0001': [409, 'REGLA_DE_NEGOCIO', null], // mensaje del trigger
};

function traducir(err) {
  const m = MAPA[err.code];
  if (!m) return null;
  return {
    status: m[0],
    error: { codigo: m[1], mensaje: m[2] || err.message, restriccion: err.constraint || undefined },
  };
}

// Envuelve un handler async: errores conocidos -> JSON; los demás al manejador 503
const api = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
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
    if (t) return res.status(t.status).json({ ok: false, error: t.error });
    next(err);
  }
};

class ErrorValidacion extends Error {
  constructor(mensaje, campos = []) {
    super(mensaje);
    this.name = 'ErrorValidacion';
    this.codigo = 'VALIDACION_FALLIDA';
    this.status = 422;
    this.campos = campos;
  }
}

class Conflicto extends Error {
  constructor(mensaje, codigo = 'CONFLICTO') {
    super(mensaje);
    this.name = 'Conflicto';
    this.codigo = codigo;
    this.status = 409;
  }
}

class NoEncontrado extends Error {
  constructor(mensaje, codigo = 'NO_ENCONTRADO') {
    super(mensaje);
    this.name = 'NoEncontrado';
    this.codigo = codigo;
    this.status = 404;
  }
}

module.exports = { traducir, api, ErrorValidacion, Conflicto, NoEncontrado };
