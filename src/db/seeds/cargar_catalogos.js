/**
 * src/db/seeds/cargar_catalogos.js
 * 
 * Script de carga y sincronización de catálogos clínicos oficiales:
 * - Diagnósticos CIE-10 (diagnosticos_cie10)
 * - Procedimientos CUPS (procedimientos_cups)
 * 
 * Estrategia de persistencia idempotente:
 *   ON CONFLICT (codigo) DO UPDATE SET
 *     descripcion = EXCLUDED.descripcion,
 *     [requiere_consentimiento = EXCLUDED.requiere_consentimiento,]
 *     activo = EXCLUDED.activo,
 *     vigente_desde = EXCLUDED.vigente_desde,
 *     vigente_hasta = EXCLUDED.vigente_hasta,
 *     fecha_modificacion = now()
 * 
 * Soporta:
 * 1. Ejecución sin argumentos: siembra los datasets maestros predeterminados con los
 *    códigos del Anexo C y casos clínicos esenciales de HISCARE (catálogo ambulatorio/IPS ampliado).
 * 2. Carga desde archivo CSV pasado como argumento (process.argv[2]):
 *    Formatos soportados con separador ';' (o ','):
 *      - codigo;descripcion
 *      - codigo;descripcion;requiere_consentimiento
 *      - codigo;descripcion;requiere_consentimiento;activo;vigente_desde;vigente_hasta
 *    Detección automática de catálogo o especificación vía segundo argumento ('cie10' | 'cups').
 * 3. Verificación activa de índices trigram GIN (ix_cie10_desc_trgm, ix_cups_desc_trgm)
 *    y pruebas de latencia predictiva (< 500 ms).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { pool, query } = require('../index');

// ============================================================================
// DATASET MAESTRO INICIAL PREPARADO PARA HISCARE (Anexo C y casuística IPS)
// ============================================================================

const MASTER_CIE10 = [
  // --- Códigos obligatorios del Anexo C y casos clínicos de HISCARE (Conservados) ---
  { codigo: 'I10X', descripcion: 'Hipertensión esencial (primaria)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'I119', descripcion: 'Enfermedad cardiaca hipertensiva sin insuficiencia cardiaca', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'I150', descripcion: 'Hipertensión renovascular', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'I251', descripcion: 'Enfermedad aterosclerótica del corazón', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E669', descripcion: 'Obesidad, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E119', descripcion: 'Diabetes mellitus no insulinodependiente, sin mención de complicación', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J459', descripcion: 'Asma, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R51X', descripcion: 'Cefalea', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'Z000', descripcion: 'Examen médico general', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'K297', descripcion: 'Gastritis, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Códigos complementarios para enriquecer búsqueda predictiva trigram (Conservados) ---
  { codigo: 'I209', descripcion: 'Angina de pecho, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'I219', descripcion: 'Infarto agudo del miocardio, sin otra especificación', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'I509', descripcion: 'Insuficiencia cardiaca, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E109', descripcion: 'Diabetes mellitus insulinodependiente, sin mención de complicación', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E039', descripcion: 'Hipotiroidismo, no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E780', descripcion: 'Hipercolesterolemia pura', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E781', descripcion: 'Hipertrigliceridemia pura', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E782', descripcion: 'Hiperlipidemia mixta', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E785', descripcion: 'Hiperlipidemia no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J00X', descripcion: 'Rinofaringitis aguda (resfriado común)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J029', descripcion: 'Faringitis aguda, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J039', descripcion: 'Amigdalitis aguda, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J069', descripcion: 'Infección aguda de las vías respiratorias superiores, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J189', descripcion: 'Neumonía, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J209', descripcion: 'Bronquitis aguda, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J449', descripcion: 'Enfermedad pulmonar obstructiva crónica, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'K219', descripcion: 'Enfermedad del reflujo gastroesofágico sin esofagitis', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'K290', descripcion: 'Gastritis hemorrágica aguda', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'K589', descripcion: 'Síndrome del colon irritable sin diarrea', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'A09X', descripcion: 'Diarrea y gastroenteritis de presunto origen infeccioso', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'N390', descripcion: 'Infección de vías urinarias, sitio no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'N189', descripcion: 'Enfermedad renal crónica, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'M545', descripcion: 'Lumbago no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'M542', descripcion: 'Cervicalgia', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'M255', descripcion: 'Dolor articular', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'M791', descripcion: 'Mialgia', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R074', descripcion: 'Dolor en el pecho, no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R104', descripcion: 'Otros dolores abdominales y los no especificados', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R509', descripcion: 'Fiebre, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R53X', descripcion: 'Malestar y fatiga', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R42X', descripcion: 'Mareo y desvanecimiento', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'F329', descripcion: 'Episodio depresivo, no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'F419', descripcion: 'Trastorno de ansiedad, no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'G439', descripcion: 'Migraña, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'G442', descripcion: 'Cefalea debida a tensión', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'H109', descripcion: 'Conjuntivitis, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'L209', descripcion: 'Dermatitis atópica, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'L309', descripcion: 'Dermatitis, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'Z012', descripcion: 'Examen odontológico', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'Z014', descripcion: 'Examen ginecológico (general) (de rutina)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'Z760', descripcion: 'Emisión de prescripción de repetición', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Catálogo ampliado ambulatorio e IPS (Infecciosas, Parasitarias y Virales) ---
  { codigo: 'A047', descripcion: 'Enterocolitis debida a Clostridium difficile', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'A084', descripcion: 'Infección viral del tracto gastrointestinal, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'B009', descripcion: 'Infección debida al virus del herpes, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'B019', descripcion: 'Varicela sin complicaciones', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'B029', descripcion: 'Herpes zóster sin complicaciones', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'B20X', descripcion: 'Enfermedad por virus de la inmunodeficiencia humana (VIH)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'B349', descripcion: 'Infección viral, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'B359', descripcion: 'Dermatofitosis, no especificada (tiña)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'B370', descripcion: 'Estomatitis candidiásica', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Neoplasias y Hematología frecuente en consulta externa ---
  { codigo: 'C509', descripcion: 'Tumor maligno de la mama, parte no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'C61X', descripcion: 'Tumor maligno de la próstata', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'C73X', descripcion: 'Tumor maligno de la glándula tiroides', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'D126', descripcion: 'Tumor benigno del colon, parte no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'D509', descripcion: 'Anemia por deficiencia de hierro sin especificación', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'D649', descripcion: 'Anemia de tipo no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Endocrinología, Nutrición y Metabolismo ---
  { codigo: 'E041', descripcion: 'Nódulo tiroideo no tóxico solitario', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E059', descripcion: 'Tirotoxicosis no especificada (hipertiroidismo)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E149', descripcion: 'Diabetes mellitus, no especificada, sin mención de complicación', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E790', descripcion: 'Hiperuricemia sin signos de artritis inflamatoria ni enfermedad tofácea', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'E871', descripcion: 'Hipoosmolaridad e hiponatremia', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Salud Mental y Trastornos Psiquiátricos Ambulatorios ---
  { codigo: 'F102', descripcion: 'Trastornos mentales debidos al uso de alcohol: síndrome de dependencia', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'F319', descripcion: 'Trastorno afectivo bipolar, no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'F339', descripcion: 'Trastorno depresivo recurrente, no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'F401', descripcion: 'Fobias sociales', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'F432', descripcion: 'Trastornos de adaptación', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'F900', descripcion: 'Trastorno de la actividad y de la atención (TDAH)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Neurología, Oftalmología y Otorrinolaringología ---
  { codigo: 'G409', descripcion: 'Epilepsia, tipo no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'G470', descripcion: 'Trastornos del inicio y del mantenimiento del sueño (insomnio)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'G560', descripcion: 'Síndrome del túnel carpiano', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'H000', descripcion: 'Orzuelo y otras inflamaciones profundas del párpado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'H521', descripcion: 'Miopía', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'H522', descripcion: 'Astigmatismo', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'H660', descripcion: 'Otitis media supurativa aguda', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'H669', descripcion: 'Otitis media, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'H810', descripcion: 'Enfermedad de Ménière', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Cardiología y Patología Vascular ---
  { codigo: 'I129', descripcion: 'Enfermedad renal hipertensiva sin insuficiencia renal', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'I489', descripcion: 'Fibrilación y aleteo auricular, no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'I802', descripcion: 'Flebitis y tromboflebitis de vasos profundos de extremidades inferiores', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'I839', descripcion: 'Venas varicosas de los miembros inferiores sin úlcera ni inflamación', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'I872', descripcion: 'Insuficiencia venosa (crónica) (periférica)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Neumología y Alergología ---
  { codigo: 'J019', descripcion: 'Sinusitis aguda, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J304', descripcion: 'Rinitis alérgica, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J40X', descripcion: 'Bronquitis, no especificada como aguda o crónica', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'J42X', descripcion: 'Bronquitis crónica no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Gastroenterología ---
  { codigo: 'K259', descripcion: 'Úlcera gástrica, no especificada como aguda ni crónica, sin hemorragia ni perforación', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'K30X', descripcion: 'Dispepsia funcional', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'K409', descripcion: 'Hernia inguinal unilateral o no especificada, sin obstrucción ni gangrena', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'K590', descripcion: 'Constipación (estreñimiento)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'K802', descripcion: 'Cálculo de la vesícula biliar sin colecistitis (colelitiasis)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Dermatología ---
  { codigo: 'L029', descripcion: 'Absceso cutáneo, forúnculo y ántrax de sitio no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'L039', descripcion: 'Celulitis de sitio no especificado', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'L500', descripcion: 'Urticaria alérgica', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'L600', descripcion: 'Uña encarnada (onicocriptosis)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'L700', descripcion: 'Acné común', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Reumatología y Osteomuscular ---
  { codigo: 'M169', descripcion: 'Coxartrosis, no especificada (artrosis de cadera)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'M179', descripcion: 'Gonartrosis, no especificada (artrosis de rodilla)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'M199', descripcion: 'Artrosis, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'M659', descripcion: 'Sinovitis y tenosinovitis, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'M751', descripcion: 'Síndrome del manguito rotatorio', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'M771', descripcion: 'Epicondilitis lateral (codo de tenista)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'M773', descripcion: 'Espolón calcáneo', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Urología y Ginecología ---
  { codigo: 'N10X', descripcion: 'Nefritis tubulointersticial aguda (pielonefritis)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'N200', descripcion: 'Cálculo del riñón (nefrolitiasis)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'N201', descripcion: 'Cálculo del uréter (ureterolitiasis)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'N300', descripcion: 'Cistitis aguda', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'N40X', descripcion: 'Hiperplasia de la próstata (adenoma prostático)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'N760', descripcion: 'Vaginitis aguda', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'N809', descripcion: 'Endometriosis, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'N920', descripcion: 'Menstruación excesiva y frecuente con ciclo regular (menorragia)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'N951', descripcion: 'Estados menopáusicos y climatéricos femeninos', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Obstetricia y Control Prenatal ---
  { codigo: 'O244', descripcion: 'Diabetes mellitus que se origina con el embarazo (gestacional)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'Z340', descripcion: 'Supervisión de primer embarazo normal', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'Z348', descripcion: 'Supervisión de otros embarazos normales', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'Z359', descripcion: 'Supervisión de embarazo de alto riesgo, sin otra especificación', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Síntomas, Signos y Traumatismos Frecuentes ---
  { codigo: 'R000', descripcion: 'Taquicardia, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R05X', descripcion: 'Tos', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R060', descripcion: 'Disnea (dificultad respiratoria)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R11X', descripcion: 'Náusea y vómito', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R300', descripcion: 'Disuria (micción dolorosa)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R31X', descripcion: 'Hematuria, no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'R55X', descripcion: 'Síncope y colapso (desmayo)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'S009', descripcion: 'Traumatismo superficial de la cabeza, parte no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'S600', descripcion: 'Contusión de dedo(s) de la mano sin daño de la uña', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'S934', descripcion: 'Esguince y torcedura del tobillo', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'T784', descripcion: 'Alergia no especificada', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'Z001', descripcion: 'Control de salud de rutina del niño (crecimiento y desarrollo)', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'Z010', descripcion: 'Examen de ojos y de la visión', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: 'Z23X', descripcion: 'Necesidad de inmunización contra enfermedad bacteriana o viral única', activo: true, vigente_desde: '2020-01-01', vigente_hasta: null }
];

const MASTER_CUPS = [
  // --- Procedimientos obligatorios del Anexo C y casos clínicos de HISCARE (Conservados) ---
  { codigo: '890201', descripcion: 'Consulta de primera vez por medicina general', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '895100', descripcion: 'Electrocardiograma de ritmo o de superficie', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '902210', descripcion: 'Hemograma IV (automatizado)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903841', descripcion: 'Glucosa en suero u otro fluido diferente a orina', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '890301', descripcion: 'Consulta de control o seguimiento por medicina general', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '871010', descripcion: 'Radiografía de tórax (PA o AP)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '906913', descripcion: 'Perfil lipídico', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Procedimientos clínicos y de apoyo diagnóstico complementarios (Conservados) ---
  { codigo: '890202', descripcion: 'Consulta de primera vez por medicina especializada', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '890302', descripcion: 'Consulta de control o seguimiento por medicina especializada', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '890701', descripcion: 'Consulta de urgencias por medicina general', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903895', descripcion: 'Creatinina en suero u otros fluidos', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903866', descripcion: 'Nitrógeno ureico (BUN)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903843', descripcion: 'Hemoglobina glicosilada (HbA1c)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '907106', descripcion: 'Uroanálisis con sedimento y densidad urinaria', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903868', descripcion: 'Ácido úrico en suero u otros fluidos', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903818', descripcion: 'Colesterol total', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903815', descripcion: 'Colesterol de alta densidad (HDL)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903816', descripcion: 'Colesterol de baja densidad (LDL)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903864', descripcion: 'Triglicéridos', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '904903', descripcion: 'Hormona estimulante del tiroides (TSH)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '904902', descripcion: 'Tiroxina libre (T4 libre)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '906422', descripcion: 'Prueba treponémica rápida (sífilis)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '906249', descripcion: 'Prueba rápida para VIH 1 y 2', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '906041', descripcion: 'Prueba de embarazo en orina o suero', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '873111', descripcion: 'Radiografía de columna lumbosacra (AP y lateral)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '871121', descripcion: 'Radiografía de senos paranasales', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '881232', descripcion: 'Ecografía abdominal total', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '881201', descripcion: 'Ecografía pélvica ginecológica transvaginal', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '881210', descripcion: 'Ecografía de tiroides', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '881234', descripcion: 'Ecografía de vías urinarias (riñones, vejiga y próstata)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '881301', descripcion: 'Ecografía obstétrica transabdominal', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '893805', descripcion: 'Espirometría clínica', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '894102', descripcion: 'Prueba de esfuerzo cardiovascular', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '895001', descripcion: 'Monitoreo electrocardiográfico continuo (Holter 24 horas)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '896100', descripcion: 'Monitoreo ambulatorio de presión arterial (MAPA)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Procedimientos con requerimiento de consentimiento informado obligatorio (Conservados) ---
  { codigo: '451600', descripcion: 'Esofagogastroduodenoscopia [EGD] con o sin biopsia', requiere_consentimiento: true, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '452300', descripcion: 'Colonoscopia total con o sin biopsia', requiere_consentimiento: true, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '861201', descripcion: 'Biopsia de piel y tejido celular subcutáneo por escisión', requiere_consentimiento: true, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Catálogo ampliado ambulatorio e IPS (Laboratorio / Hematología y Coagulación) ---
  { codigo: '902045', descripcion: 'Tiempo de protrombina [PT]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '902049', descripcion: 'Tiempo de tromboplastina parcial [PTT]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '902204', descripcion: 'Velocidad de sedimentación globular [VSG]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '902015', descripcion: 'Ferritina en suero', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '902024', descripcion: 'Hierro sérico total', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '902102', descripcion: 'Frotis de sangre periférica con morfología', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Química Sanguínea, Función Hepática y Enzimas ---
  { codigo: '903856', descripcion: 'Bilirrubina total y directa', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903848', descripcion: 'Transaminasa oxalacética [AST / GOT]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903849', descripcion: 'Transaminasa pirúvica [ALT / GPT]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903837', descripcion: 'Fosfatasa alcalina', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903838', descripcion: 'Gamma glutamil transferasa [GGT]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903801', descripcion: 'Amilasa en suero', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903803', descripcion: 'Lipasa en suero', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903822', descripcion: 'Electrolitos séricos (Sodio, Potasio, Cloro)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903820', descripcion: 'Calcio sérico', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903858', descripcion: 'Proteínas totales y fraccionadas en suero', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '903875', descripcion: 'Microalbuminuria en orina de muestra aislada', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Microbiología, Parasitología e Inmunología ---
  { codigo: '901206', descripcion: 'Coprológico por concentración', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '901305', descripcion: 'Urocultivo con antibiograma automatizado', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '901107', descripcion: 'Cultivo faríngeo con antibiograma', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '901217', descripcion: 'Frotis y examen en fresco de flujo vaginal', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '906210', descripcion: 'Antígeno prostático específico [PSA total]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '906915', descripcion: 'Proteína C reactiva de alta sensibilidad [PCR]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '906318', descripcion: 'Vitamina D (25-hidroxivitamina D)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '906319', descripcion: 'Vitamina B12 [Cianocobalamina]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '906127', descripcion: 'Antígeno de superficie del virus de la Hepatitis B [HBsAg]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '906129', descripcion: 'Anticuerpos contra el virus de la Hepatitis C [Anti-HCV]', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Imagenología / Radiología Musculoesquelética y Contrastada ---
  { codigo: '872011', descripcion: 'Radiografía de columna cervical (AP y lateral)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '873211', descripcion: 'Radiografía de pelvis o cadera (AP)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '873411', descripcion: 'Radiografía de hombro (AP y rotación)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '873431', descripcion: 'Radiografía de muñeca (AP y lateral)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '873521', descripcion: 'Radiografía de rodilla (AP y lateral)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '873531', descripcion: 'Radiografía de tobillo (AP y lateral)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '876801', descripcion: 'Mamografía bilateral convencional o digital', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Ultrasonido / Ecografía y Vascular Doppler ---
  { codigo: '881231', descripcion: 'Ecografía de abdomen superior (hígado, páncreas, vías biliares)', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '881112', descripcion: 'Ecografía articular o de tejidos blandos de extremidades', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '881240', descripcion: 'Ecografía testicular con transductor de alta resolución', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '881401', descripcion: 'Ecocardiograma transtorácico bidimensional con doppler color', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '882101', descripcion: 'Doppler venoso de miembros inferiores bilateral', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '882102', descripcion: 'Doppler arterial de miembros inferiores bilateral', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },

  // --- Consultas Interdisciplinarias y Procedimientos Terapéuticos ---
  { codigo: '890203', descripcion: 'Consulta de primera vez por odontología general', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '890303', descripcion: 'Consulta de control o seguimiento por odontología general', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '890205', descripcion: 'Consulta de primera vez por enfermería', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '890206', descripcion: 'Consulta de primera vez por psicología', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '890208', descripcion: 'Consulta de primera vez por nutrición y dietética', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '931000', descripcion: 'Sesión de fisioterapia o terapia física integral', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '932200', descripcion: 'Sesión de terapia respiratoria integral', requiere_consentimiento: false, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '992101', descripcion: 'Infiltración intraarticular de articulación mayor con corticoide o anestésico', requiere_consentimiento: true, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null },
  { codigo: '863101', descripcion: 'Drenaje de absceso subcutáneo o hematoma con desbridamiento', requiere_consentimiento: true, activo: true, vigente_desde: '2020-01-01', vigente_hasta: null }
];

// ============================================================================
// VERIFICACIÓN Y CREACIÓN DE COLUMNAS DE VIGENCIA E ÍNDICES TRIGRAM GIN
// ============================================================================

/**
 * Asegura de manera idempotente que las tablas de catálogos tengan las columnas
 * requeridas para el control de vigencia temporal (activo, vigente_desde, vigente_hasta).
 */
async function asegurarColumnasVigencia(client) {
  const runner = client || pool;
  await runner.query(`
    ALTER TABLE diagnosticos_cie10 
      ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS vigente_desde date NOT NULL DEFAULT DATE '2020-01-01',
      ADD COLUMN IF NOT EXISTS vigente_hasta date NULL;
  `);

  await runner.query(`
    ALTER TABLE procedimientos_cups 
      ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS vigente_desde date NOT NULL DEFAULT DATE '2020-01-01',
      ADD COLUMN IF NOT EXISTS vigente_hasta date NULL;
  `);
}

async function asegurarIndicesTrigram(client) {
  const runner = client || pool;
  console.log('[DB-INIT] Asegurando columnas de vigencia, extensión pg_trgm e índices trigram...');

  await asegurarColumnasVigencia(runner);

  await runner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

  await runner.query(`
    CREATE INDEX IF NOT EXISTS ix_cie10_desc_trgm
    ON diagnosticos_cie10 USING gin (descripcion gin_trgm_ops);
  `);

  await runner.query(`
    CREATE INDEX IF NOT EXISTS ix_cups_desc_trgm
    ON procedimientos_cups USING gin (descripcion gin_trgm_ops);
  `);

  console.log('[DB-INIT] Columnas de vigencia, extensión e índices GIN verificados correctamente.');
}

// ============================================================================
// PERSISTENCIA IDEMPOTENTE: UPSERT CIE-10
// ============================================================================

async function upsertCie10(registros, client) {
  const runner = client || pool;
  let insertados = 0;
  let actualizados = 0;

  const sql = `
    INSERT INTO diagnosticos_cie10 (codigo, descripcion, activo, vigente_desde, vigente_hasta)
    VALUES ($1, $2, COALESCE($3, true), COALESCE($4::date, DATE '2020-01-01'), $5::date)
    ON CONFLICT (codigo) DO UPDATE
      SET descripcion = EXCLUDED.descripcion,
          activo = EXCLUDED.activo,
          vigente_desde = EXCLUDED.vigente_desde,
          vigente_hasta = EXCLUDED.vigente_hasta,
          fecha_modificacion = now()
    RETURNING (xmax = 0) AS fue_insertado;
  `;

  for (const item of registros) {
    const activo = item.activo !== undefined ? Boolean(item.activo) : true;
    const vigenteDesde = item.vigente_desde || '2020-01-01';
    const vigenteHasta = item.vigente_hasta || null;

    const res = await runner.query(sql, [
      item.codigo.trim(),
      item.descripcion.trim(),
      activo,
      vigenteDesde,
      vigenteHasta
    ]);
    if (res.rows[0].fue_insertado) {
      insertados++;
    } else {
      actualizados++;
    }
  }

  return { total: registros.length, insertados, actualizados };
}

// ============================================================================
// PERSISTENCIA IDEMPOTENTE: UPSERT CUPS
// ============================================================================

async function upsertCups(registros, client) {
  const runner = client || pool;
  let insertados = 0;
  let actualizados = 0;

  const sql = `
    INSERT INTO procedimientos_cups (codigo, descripcion, requiere_consentimiento, activo, vigente_desde, vigente_hasta)
    VALUES ($1, $2, $3, COALESCE($4, true), COALESCE($5::date, DATE '2020-01-01'), $6::date)
    ON CONFLICT (codigo) DO UPDATE
      SET descripcion = EXCLUDED.descripcion,
          requiere_consentimiento = EXCLUDED.requiere_consentimiento,
          activo = EXCLUDED.activo,
          vigente_desde = EXCLUDED.vigente_desde,
          vigente_hasta = EXCLUDED.vigente_hasta,
          fecha_modificacion = now()
    RETURNING (xmax = 0) AS fue_insertado;
  `;

  for (const item of registros) {
    const reqConsent = item.requiere_consentimiento === true;
    const activo = item.activo !== undefined ? Boolean(item.activo) : true;
    const vigenteDesde = item.vigente_desde || '2020-01-01';
    const vigenteHasta = item.vigente_hasta || null;

    const res = await runner.query(sql, [
      item.codigo.trim(),
      item.descripcion.trim(),
      reqConsent,
      activo,
      vigenteDesde,
      vigenteHasta
    ]);
    if (res.rows[0].fue_insertado) {
      insertados++;
    } else {
      actualizados++;
    }
  }

  return { total: registros.length, insertados, actualizados };
}

// ============================================================================
// PARSER DE ARCHIVOS CSV (codigo;descripcion [;requiere_consentimiento] [;activo] [;vigente_desde] [;vigente_hasta])
// ============================================================================

function parsearLineaCsv(linea, separador = ';') {
  const campos = [];
  let actual = '';
  let dentroComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const char = linea[i];
    if (char === '"') {
      dentroComillas = !dentroComillas;
    } else if (char === separador && !dentroComillas) {
      campos.push(actual.trim());
      actual = '';
    } else {
      actual += char;
    }
  }
  campos.push(actual.trim());
  return campos;
}

async function leerCsv(rutaArchivo) {
  const rutaAbsoluta = path.isAbsolute(rutaArchivo)
    ? rutaArchivo
    : path.resolve(process.cwd(), rutaArchivo);

  if (!fs.existsSync(rutaAbsoluta)) {
    throw new Error(`El archivo CSV no existe en la ruta: ${rutaAbsoluta}`);
  }

  const fileStream = fs.createReadStream(rutaAbsoluta, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const filas = [];
  let separador = ';';
  let esPrimeraLinea = true;

  for await (const lineaBruta of rl) {
    let linea = lineaBruta.trim();
    if (!linea) continue;

    // Remover posible BOM de UTF-8
    if (linea.charCodeAt(0) === 0xfeff) {
      linea = linea.slice(1).trim();
    }

    if (esPrimeraLinea) {
      // Auto-detectar separador entre ';' y ',' si la línea contiene comas pero no punto y coma
      if (!linea.includes(';') && linea.includes(',')) {
        separador = ',';
      }
      esPrimeraLinea = false;

      // Descartar encabezado si existe (ej. codigo;descripcion)
      const cabeceras = parsearLineaCsv(linea, separador).map(c => c.toLowerCase());
      if (cabeceras[0] && (cabeceras[0].includes('cod') || cabeceras[0] === 'code')) {
        continue;
      }
    }

    const cols = parsearLineaCsv(linea, separador);
    if (cols.length < 2) continue;

    const codigo = cols[0];
    const descripcion = cols[1];
    let requiereConsentimiento = false;
    let activo = true;
    let vigenteDesde = '2020-01-01';
    let vigenteHasta = null;

    if (cols.length >= 3) {
      const val = (cols[2] || '').toLowerCase().trim();
      requiereConsentimiento = (val === 'true' || val === 't' || val === '1' || val === 'si' || val === 'sí' || val === 's');
    }

    if (cols.length >= 4 && cols[3] !== undefined && cols[3] !== '') {
      const valAct = (cols[3] || '').toLowerCase().trim();
      activo = !(valAct === 'false' || valAct === 'f' || valAct === '0' || valAct === 'no');
    }

    if (cols.length >= 5 && cols[4] !== undefined && cols[4] !== '') {
      vigenteDesde = cols[4].trim();
    }

    if (cols.length >= 6 && cols[5] !== undefined && cols[5] !== '') {
      vigenteHasta = cols[5].trim() || null;
    }

    if (codigo && descripcion) {
      filas.push({
        codigo,
        descripcion,
        requiere_consentimiento: requiereConsentimiento,
        activo,
        vigente_desde: vigenteDesde,
        vigente_hasta: vigenteHasta
      });
    }
  }

  return filas;
}

function deducirTipoCatalogo(filas, rutaArchivo, tipoForzado) {
  if (tipoForzado) {
    const t = tipoForzado.toLowerCase();
    if (t.includes('cie') || t === 'cie10') return 'cie10';
    if (t.includes('cup') || t === 'cups') return 'cups';
  }

  const nombreArchivo = path.basename(rutaArchivo).toLowerCase();
  if (nombreArchivo.includes('cie')) return 'cie10';
  if (nombreArchivo.includes('cup')) return 'cups';

  // Analizar datos
  let cuentaCie10 = 0;
  let cuentaCups = 0;
  let tieneTerceraColumnaConsentimiento = false;

  for (const fila of filas.slice(0, 20)) {
    if (fila.requiere_consentimiento === true) {
      tieneTerceraColumnaConsentimiento = true;
    }
    if (/^[A-Z]\d{2,3}[A-Z0-9]?$/i.test(fila.codigo)) {
      cuentaCie10++;
    } else if (/^\d{5,8}$/.test(fila.codigo)) {
      cuentaCups++;
    }
  }

  if (tieneTerceraColumnaConsentimiento) return 'cups';
  if (cuentaCups > cuentaCie10) return 'cups';
  return 'cie10';
}

// ============================================================================
// BENCHMARK DE BÚSQUEDA TRIGRAM (< 500 ms)
// ============================================================================

async function verificarBusquedaPredictivaTrigram(client) {
  const runner = client || pool;
  console.log('\n--- VERIFICACIÓN DE BÚSQUEDA PREDICTIVA TRIGRAM (< 500 ms) ---');

  // Test 1: Búsqueda CIE-10 predictiva
  const terminoCie = 'hiperten';
  const t0 = process.hrtime.bigint();
  const resCie = await runner.query(
    `SELECT codigo, descripcion, similarity(descripcion, $1) AS sim
     FROM diagnosticos_cie10
     WHERE descripcion % $1 OR descripcion ILIKE ('%' || $1 || '%')
     ORDER BY similarity(descripcion, $1) DESC
     LIMIT 5;`,
    [terminoCie]
  );
  const t1 = process.hrtime.bigint();
  const duracionCieMs = Number(t1 - t0) / 1e6;

  console.log(`[CIE-10 Trigram] Query para '${terminoCie}':`);
  console.log(`  - Tiempo de ejecución: ${duracionCieMs.toFixed(3)} ms (Objetivo < 500 ms: ${duracionCieMs < 500 ? 'CUMPLE OK' : 'FALLA'})`);
  console.log(`  - Resultados obtenidos (${resCie.rows.length}):`);
  resCie.rows.forEach(r => console.log(`    * [${r.codigo}] ${r.descripcion} (sim: ${Number(r.sim).toFixed(2)})`));

  // Test 2: Búsqueda CUPS predictiva
  const terminoCups = 'electrocard';
  const t2 = process.hrtime.bigint();
  const resCups = await runner.query(
    `SELECT codigo, descripcion, requiere_consentimiento, similarity(descripcion, $1) AS sim
     FROM procedimientos_cups
     WHERE descripcion % $1 OR descripcion ILIKE ('%' || $1 || '%')
     ORDER BY similarity(descripcion, $1) DESC
     LIMIT 5;`,
    [terminoCups]
  );
  const t3 = process.hrtime.bigint();
  const duracionCupsMs = Number(t3 - t2) / 1e6;

  console.log(`\n[CUPS Trigram] Query para '${terminoCups}':`);
  console.log(`  - Tiempo de ejecución: ${duracionCupsMs.toFixed(3)} ms (Objetivo < 500 ms: ${duracionCupsMs < 500 ? 'CUMPLE OK' : 'FALLA'})`);
  console.log(`  - Resultados obtenidos (${resCups.rows.length}):`);
  resCups.rows.forEach(r => console.log(`    * [${r.codigo}] ${r.descripcion} (Consentimiento: ${r.requiere_consentimiento ? 'SÍ' : 'NO'})`));

  return {
    cie10: { termino: terminoCie, duracionMs: duracionCieMs, filas: resCie.rows.length },
    cups: { termino: terminoCups, duracionMs: duracionCupsMs, filas: resCups.rows.length }
  };
}

// ============================================================================
// FUNCIÓN PRINCIPAL DE EJECUCIÓN
// ============================================================================

async function cargarCatalogos(opciones = {}) {
  const rutaCsv = opciones.rutaCsv || (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null);
  const tipoForzado = opciones.tipo || process.argv[3] || null;

  const client = await pool.connect();
  const inicioCarga = Date.now();

  try {
    console.log('================================================================');
    console.log('      HISCARE - CARGA DE CATÁLOGOS CLÍNICOS OFICIALES           ');
    console.log('================================================================');

    await asegurarColumnasVigencia(client);
    await asegurarIndicesTrigram(client);

    const reporte = {
      tipoEjecucion: rutaCsv ? 'CSV' : 'MAESTRO_PREDETERMINADO',
      rutaCsv: rutaCsv || null,
      cie10: null,
      cups: null,
      totalTiempoMs: 0
    };

    if (rutaCsv) {
      console.log(`\n[CARGA CSV] Procesando archivo: ${rutaCsv}`);
      const filas = await leerCsv(rutaCsv);
      const tipo = deducirTipoCatalogo(filas, rutaCsv, tipoForzado);

      console.log(`[CARGA CSV] Se leyeron ${filas.length} registros. Catálogo detectado: ${tipo.toUpperCase()}`);

      await client.query('BEGIN');
      if (tipo === 'cie10') {
        const stats = await upsertCie10(filas, client);
        reporte.cie10 = stats;
        console.log(`[CIE-10] Total: ${stats.total} | Insertados: ${stats.insertados} | Actualizados: ${stats.actualizados}`);
      } else {
        const stats = await upsertCups(filas, client);
        reporte.cups = stats;
        console.log(`[CUPS] Total: ${stats.total} | Insertados: ${stats.insertados} | Actualizados: ${stats.actualizados}`);
      }
      await client.query('COMMIT');
    } else {
      console.log('\n[CARGA MAESTRO] Sembrando catálogo inicial de CIE-10 y CUPS...');

      await client.query('BEGIN');
      const statsCie = await upsertCie10(MASTER_CIE10, client);
      const statsCups = await upsertCups(MASTER_CUPS, client);
      await client.query('COMMIT');

      reporte.cie10 = statsCie;
      reporte.cups = statsCups;

      console.log(`[CIE-10] Total maestro: ${statsCie.total} | Insertados: ${statsCie.insertados} | Actualizados: ${statsCie.actualizados}`);
      console.log(`[CUPS] Total maestro: ${statsCups.total} | Insertados: ${statsCups.insertados} | Actualizados: ${statsCups.actualizados}`);
    }

    // Totales actuales en BD
    const cTotalCie = await client.query('SELECT count(*) AS count FROM diagnosticos_cie10');
    const cTotalCups = await client.query('SELECT count(*) AS count FROM procedimientos_cups');
    reporte.totalesEnBd = {
      cie10: parseInt(cTotalCie.rows[0].count, 10),
      cups: parseInt(cTotalCups.rows[0].count, 10)
    };

    console.log(`\n[ESTADO BD] Total registros persistidos en diagnosticos_cie10: ${reporte.totalesEnBd.cie10}`);
    console.log(`[ESTADO BD] Total registros persistidos en procedimientos_cups: ${reporte.totalesEnBd.cups}`);

    // Prueba trigram
    reporte.verificacionTrigram = await verificarBusquedaPredictivaTrigram(client);

    reporte.totalTiempoMs = Date.now() - inicioCarga;
    console.log(`\n[FIN] Proceso completado exitosamente en ${reporte.totalTiempoMs} ms.`);
    console.log('================================================================');

    return reporte;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[ERROR] Error durante la carga de catálogos:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// AUTO-EJECUCIÓN CLI
// ============================================================================

if (require.main === module) {
  cargarCatalogos()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}

module.exports = {
  cargarCatalogos,
  asegurarColumnasVigencia,
  asegurarIndicesTrigram,
  upsertCie10,
  upsertCups,
  leerCsv,
  deducirTipoCatalogo,
  verificarBusquedaPredictivaTrigram,
  MASTER_CIE10,
  MASTER_CUPS
};
