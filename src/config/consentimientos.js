// src/config/consentimientos.js — Catálogo y textos sugeridos de consentimientos informados (C.19)

const TIPOS_CONSENTIMIENTO = [
  {
    tipo: 'Toma de muestras de laboratorio',
    descripcionSugerida:
      'Autorizo la toma de muestra de sangre venosa para hemograma y glucosa en suero. Se me explicaron riesgos (hematoma, dolor leve) y alternativas.',
  },
  {
    tipo: 'Tratamiento de datos personales (Ley 1581)',
    descripcionSugerida:
      'Autorizo expresamente el tratamiento, almacenamiento y uso de mis datos personales y sensibles conforme a la Ley 1581 de 2012 y la política institucional de HISCARE.',
  },
  {
    tipo: 'Procedimiento menor / biopsia',
    descripcionSugerida:
      'Autorizo la realización del procedimiento menor indicado por el médico tratante, previa explicación de beneficios, riesgos y alternativas.',
  },
  {
    tipo: 'Procedimiento quirúrgico ambulatorio',
    descripcionSugerida:
      'Autorizo la intervención quirúrgica ambulatoria prescrita, comprendiendo los riesgos anestésicos y quirúrgicos explicados.',
  },
  {
    tipo: 'Transfusión de componentes sanguíneos',
    descripcionSugerida:
      'Autorizo la transfusión de hemoderivados según criterio clínico de urgencia o tratamiento, conociendo riesgos y beneficios.',
  },
  {
    tipo: 'Sedación y analgesia',
    descripcionSugerida:
      'Autorizo la administración de sedación y analgesia supervisada para el procedimiento programado.',
  },
];

/**
 * Retorna la lista de tipos de consentimiento en formato array de strings.
 * @returns {string[]}
 */
function listaTipos() {
  return TIPOS_CONSENTIMIENTO.map((item) => item.tipo);
}

module.exports = {
  TIPOS_CONSENTIMIENTO,
  listaTipos,
};
