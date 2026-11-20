-- ============================================================================
-- HISCARE — SCRIPT 02: SEED UNIFICADO DE DATOS DE PRUEBA (IPS MEDIANA OCT-DIC 2026)
-- Archivo: bd/02_seed_datos_prueba.sql
-- Motor: PostgreSQL 15+  |  Codificación: UTF-8
-- Versión: 3.0.0 (Limpieza total previa + flujo IPS mediana 2026-10-01 a 2026-12-15)
--
-- DESCRIPCIÓN:
-- Script idempotente y transaccional que realiza limpieza total de datos
-- previos en todas las tablas de la base de datos (28 en `public` y 3 en
-- `infra`, 31 tablas en total) antes de sembrar desde cero:
--   - FASE 1: Limpieza total y topológica (session_replication_role = 'replica',
--     TRUNCATE CASCADE de las 31 tablas, reinicio de seq_orden_codigo a 89001).
--   - FASE 2: Semillas institucionales base y equipo IPS mediana:
--     5 roles, 17 usuarios (conservando los 7 usuarios demo originales con clave
--     'Hiscare2026!' en bcrypt costo 12 vía pgcrypto + 10 profesionales
--     adicionales), 5 especialidades, asignaciones médicas (8 médicos),
--     6 aseguradoras/EPS, catálogo completo CIE-10 (51 códigos con vigencia) y
--     catálogo completo CUPS (38 códigos con vigencia y consentimiento).
--   - FASE 3: Agendas médicas semanales L-V y sábado en la mañana (8 médicos).
--   - FASE 4: 200 pacientes colombianos (conservando los 9 pacientes base,
--     incluyendo CC 1234567890 Juan Diego Pérez García como único afiliado a
--     EPS Sanitas por invariante C.14), 200 historias clínicas, 200 contactos de
--     emergencia, 200 afiliaciones EPS (vigencia 2026-01-01 a 2026-12-31) y ~165
--     antecedentes clínicos.
--   - FASE 5: Flujo clínico completo determinista (setseed(0.42)) entre el
--     2026-10-01 y el 2026-12-15 (~460 citas sin cruces GiST, ~250 atenciones
--     con signos vitales, evoluciones SOAP, diagnósticos CIE-10, procedimientos
--     CUPS, consentimientos informados, notas de alta, cierre real con firma
--     SHA-256, ~12 atenciones ABIERTA con infra.borradores, órdenes
--     diagnósticas LIS/RIS, integraciones, resultados con notificación
--     automática vía trigger y ~28 adendas clínicas).
--
-- PRERREQUISITO:
--   Haber ejecutado previamente bd/01_esquema_y_reglas.sql.
--   Ejecutar como superusuario (postgres) para permitir la limpieza total
--   controlada de todas las tablas (incluyendo auditoria) durante el reinicio.
-- ============================================================================

BEGIN;

-- Limpiar contexto de sesión para auditoría de semillas (acotado a la transacción)
SELECT set_config('hiscare.usuario_id', '', true);
SELECT set_config('hiscare.ip_origen', '', true);

-- ----------------------------------------------------------------------------
-- FASE 1: LIMPIEZA TOTAL Y TOPOLÓGICA DE TODAS LAS TABLAS DE LA BASE DE DATOS
-- (Elimina absolutamente todos los datos previos de las 31 tablas —28 en
--  `public` y 3 en `infra`— sin preservar residuos de ejecuciones previas en
--  seguridad, maestros, catálogos ni tablas operacionales/clínicas)
-- ----------------------------------------------------------------------------
SET LOCAL session_replication_role = 'replica';

-- Esquema infra (3 tablas)
TRUNCATE TABLE infra.session CASCADE;
TRUNCATE TABLE infra.tokens_recuperacion CASCADE; -- Tabla legado sin uso
TRUNCATE TABLE infra.borradores CASCADE;

-- Esquema public: tablas operacionales, clínicas y auditoría (21 tablas)
TRUNCATE TABLE public.notificaciones CASCADE;
TRUNCATE TABLE public.adendas CASCADE;
TRUNCATE TABLE public.notas_alta CASCADE;
TRUNCATE TABLE public.procedimientos_atencion CASCADE;
TRUNCATE TABLE public.diagnosticos_atencion CASCADE;
TRUNCATE TABLE public.evoluciones_medicas CASCADE;
TRUNCATE TABLE public.consentimientos_medicos CASCADE;
TRUNCATE TABLE public.signos_vitales CASCADE;
TRUNCATE TABLE public.integraciones CASCADE;
TRUNCATE TABLE public.resultados_diagnosticos CASCADE;
TRUNCATE TABLE public.detalle_orden CASCADE;
TRUNCATE TABLE public.ordenes_diagnosticas CASCADE;
TRUNCATE TABLE public.atenciones CASCADE;
TRUNCATE TABLE public.citas CASCADE;
TRUNCATE TABLE public.antecedentes CASCADE;
TRUNCATE TABLE public.historias_clinicas CASCADE;
TRUNCATE TABLE public.contactos_emergencia CASCADE;
TRUNCATE TABLE public.paciente_aseguradora CASCADE;
TRUNCATE TABLE public.pacientes CASCADE;
TRUNCATE TABLE public.agendas_medicas CASCADE;
TRUNCATE TABLE public.auditoria CASCADE;

-- Esquema public: seguridad, maestros y catálogos clínicos (7 tablas)
TRUNCATE TABLE public.usuario_especialidad CASCADE;
TRUNCATE TABLE public.usuarios CASCADE;
TRUNCATE TABLE public.roles CASCADE;
TRUNCATE TABLE public.especialidades CASCADE;
TRUNCATE TABLE public.aseguradoras CASCADE;
TRUNCATE TABLE public.diagnosticos_cie10 CASCADE;
TRUNCATE TABLE public.procedimientos_cups CASCADE;

-- Reinicio de la secuencia de órdenes correlativas
ALTER SEQUENCE seq_orden_codigo RESTART WITH 89001;

-- Reactivar validaciones y triggers de integridad de negocio
SET LOCAL session_replication_role = 'origin';

-- ----------------------------------------------------------------------------
-- FASE 2: DATOS MAESTROS, SEGURIDAD Y CATÁLOGOS CLÍNICOS (IDEMPOTENTES)
-- ----------------------------------------------------------------------------

-- 2.1 Roles del Sistema
INSERT INTO roles (nombre) VALUES
  ('ADMINISTRADOR'),
  ('MEDICO'),
  ('RECEPCIONISTA'),
  ('ENFERMERO'),
  ('AUDITOR')
ON CONFLICT (nombre) DO NOTHING;

-- 2.2 Usuarios Demostrativos e Institucionales (IPS Mediana: 17 usuarios activos)
-- Contraseña unificada para entorno de prueba/evaluación: Hiscare2026!
-- Cifrada con Blowfish (bcrypt) costo 12 vía pgcrypto (compatible con bcryptjs).
INSERT INTO usuarios (nombre, email, password_hash, rol_id, debe_cambiar_clave)
SELECT u.nombre, u.email, crypt('Hiscare2026!', gen_salt('bf', 12)), r.id, false
FROM (VALUES
  -- 7 usuarios demo originales (compatibilidad total con pruebas automatizadas)
  ('Administrador HISCARE',     'admin@hiscare.edu.co',     'ADMINISTRADOR'),
  ('Ana Perez',                 'aperez@hiscare.edu.co',    'MEDICO'),
  ('Carlos Garcia',             'cgarcia@hiscare.edu.co',   'MEDICO'),
  ('Laura Rios',                'lrios@hiscare.edu.co',     'RECEPCIONISTA'),
  ('Diana Mora',                'dmora@hiscare.edu.co',     'ENFERMERO'),
  ('Liliana Suarez',            'lsuarez@hiscare.edu.co',   'ENFERMERO'),
  ('Auditor Calidad',           'auditor@hiscare.edu.co',   'AUDITOR'),
  -- 10 profesionales adicionales de IPS mediana (6 médicos, 2 enfermeros, 1 recepcionista, 1 auditor)
  ('Dra. Sofía Martínez',       'smartinez@hiscare.edu.co', 'MEDICO'),
  ('Dr. Roberto Gómez',         'rgomez@hiscare.edu.co',    'MEDICO'),
  ('Dr. Fernando Castro',       'fcastro@hiscare.edu.co',   'MEDICO'),
  ('Dr. Mauricio Ospina',       'mospina@hiscare.edu.co',   'MEDICO'),
  ('Dra. Juliana Restrepo',     'jrestrepo@hiscare.edu.co', 'MEDICO'),
  ('Dr. Luis Eduardo Valencia', 'lvalencia@hiscare.edu.co', 'MEDICO'),
  ('Javier Morales',            'jmorales@hiscare.edu.co',  'ENFERMERO'),
  ('Paula Andrea Vargas',       'pvargas@hiscare.edu.co',   'ENFERMERO'),
  ('Camila Torres',             'ctorres@hiscare.edu.co',   'RECEPCIONISTA'),
  ('Dr. Hernán Darío Gómez',    'hgomez@hiscare.edu.co',    'AUDITOR')
) AS u(nombre, email, rol)
JOIN roles r ON r.nombre = u.rol
ON CONFLICT (email) DO NOTHING;

-- 2.3 Especialidades Médicas
INSERT INTO especialidades (nombre) VALUES
  ('Medicina general'),
  ('Medicina interna'),
  ('Pediatria'),
  ('Ginecologia'),
  ('Cardiologia')
ON CONFLICT (nombre) DO NOTHING;

-- 2.4 Asignación de Especialidades a los 8 Médicos (cubriendo las 5 especialidades)
INSERT INTO usuario_especialidad (usuario_id, especialidad_id)
SELECT u.id, e.id
FROM usuarios u
JOIN especialidades e
  ON (u.email = 'aperez@hiscare.edu.co'    AND e.nombre IN ('Medicina general', 'Medicina interna'))
  OR (u.email = 'cgarcia@hiscare.edu.co'   AND e.nombre = 'Medicina general')
  OR (u.email = 'smartinez@hiscare.edu.co' AND e.nombre IN ('Pediatria', 'Medicina general'))
  OR (u.email = 'rgomez@hiscare.edu.co'    AND e.nombre = 'Ginecologia')
  OR (u.email = 'fcastro@hiscare.edu.co'   AND e.nombre IN ('Cardiologia', 'Medicina interna'))
  OR (u.email = 'mospina@hiscare.edu.co'   AND e.nombre IN ('Medicina interna', 'Cardiologia'))
  OR (u.email = 'jrestrepo@hiscare.edu.co' AND e.nombre IN ('Pediatria', 'Medicina general'))
  OR (u.email = 'lvalencia@hiscare.edu.co' AND e.nombre IN ('Medicina general', 'Ginecologia'))
ON CONFLICT (usuario_id, especialidad_id) DO NOTHING;

-- 2.5 Aseguradoras y Entidades Promotoras de Salud (EPS)
INSERT INTO aseguradoras (nombre, tipo_plan, activo) VALUES
  ('EPS Sanitas',        'Contributivo', true),
  ('Nueva EPS',          'Contributivo', true),
  ('Compensar EPS',      'Contributivo', true),
  ('Capital Salud EPS',  'Subsidiado',   true),
  ('Fuerzas Militares',  'Especial',     true),
  ('Particular',         'Particular',   true)
ON CONFLICT (nombre) DO NOTHING;

-- 2.6 Catálogo Maestro de Diagnósticos CIE-10 (51 códigos con vigencia Fase 1)
INSERT INTO diagnosticos_cie10 (codigo, descripcion, activo, vigente_desde, vigente_hasta) VALUES
  -- Códigos obligatorios del Anexo C y casos clínicos de HISCARE
  ('I10X', 'Hipertensión esencial (primaria)', true, DATE '2020-01-01', NULL),
  ('I119', 'Enfermedad cardiaca hipertensiva sin insuficiencia cardiaca', true, DATE '2020-01-01', NULL),
  ('I150', 'Hipertensión renovascular', true, DATE '2020-01-01', NULL),
  ('I251', 'Enfermedad aterosclerótica del corazón', true, DATE '2020-01-01', NULL),
  ('E669', 'Obesidad, no especificada', true, DATE '2020-01-01', NULL),
  ('E119', 'Diabetes mellitus no insulinodependiente, sin mención de complicación', true, DATE '2020-01-01', NULL),
  ('J459', 'Asma, no especificada', true, DATE '2020-01-01', NULL),
  ('R51X', 'Cefalea', true, DATE '2020-01-01', NULL),
  ('Z000', 'Examen médico general', true, DATE '2020-01-01', NULL),
  ('K297', 'Gastritis, no especificada', true, DATE '2020-01-01', NULL),
  -- Códigos complementarios para búsqueda trigram predictiva y casos clínicos
  ('I209', 'Angina de pecho, no especificada', true, DATE '2020-01-01', NULL),
  ('I219', 'Infarto agudo del miocardio, sin otra especificación', true, DATE '2020-01-01', NULL),
  ('I509', 'Insuficiencia cardiaca, no especificada', true, DATE '2020-01-01', NULL),
  ('E109', 'Diabetes mellitus insulinodependiente, sin mención de complicación', true, DATE '2020-01-01', NULL),
  ('E039', 'Hipotiroidismo, no especificado', true, DATE '2020-01-01', NULL),
  ('E780', 'Hipercolesterolemia pura', true, DATE '2020-01-01', NULL),
  ('E781', 'Hipertrigliceridemia pura', true, DATE '2020-01-01', NULL),
  ('E782', 'Hiperlipidemia mixta', true, DATE '2020-01-01', NULL),
  ('E785', 'Hiperlipidemia no especificada', true, DATE '2020-01-01', NULL),
  ('J00X', 'Rinofaringitis aguda (resfriado común)', true, DATE '2020-01-01', NULL),
  ('J029', 'Faringitis aguda, no especificada', true, DATE '2020-01-01', NULL),
  ('J039', 'Amigdalitis aguda, no especificada', true, DATE '2020-01-01', NULL),
  ('J069', 'Infección aguda de las vías respiratorias superiores, no especificada', true, DATE '2020-01-01', NULL),
  ('J189', 'Neumonía, no especificada', true, DATE '2020-01-01', NULL),
  ('J209', 'Bronquitis aguda, no especificada', true, DATE '2020-01-01', NULL),
  ('J449', 'Enfermedad pulmonar obstructiva crónica, no especificada', true, DATE '2020-01-01', NULL),
  ('K219', 'Enfermedad del reflujo gastroesofágico sin esofagitis', true, DATE '2020-01-01', NULL),
  ('K290', 'Gastritis hemorrágica aguda', true, DATE '2020-01-01', NULL),
  ('K589', 'Síndrome del colon irritable sin diarrea', true, DATE '2020-01-01', NULL),
  ('A09X', 'Diarrea y gastroenteritis de presunto origen infeccioso', true, DATE '2020-01-01', NULL),
  ('N390', 'Infección de vías urinarias, sitio no especificado', true, DATE '2020-01-01', NULL),
  ('N189', 'Enfermedad renal crónica, no especificada', true, DATE '2020-01-01', NULL),
  ('M545', 'Lumbago no especificado', true, DATE '2020-01-01', NULL),
  ('M542', 'Cervicalgia', true, DATE '2020-01-01', NULL),
  ('M255', 'Dolor articular', true, DATE '2020-01-01', NULL),
  ('M791', 'Mialgia', true, DATE '2020-01-01', NULL),
  ('R074', 'Dolor en el pecho, no especificado', true, DATE '2020-01-01', NULL),
  ('R104', 'Otros dolores abdominales y los no especificados', true, DATE '2020-01-01', NULL),
  ('R509', 'Fiebre, no especificada', true, DATE '2020-01-01', NULL),
  ('R53X', 'Malestar y fatiga', true, DATE '2020-01-01', NULL),
  ('R42X', 'Mareo y desvanecimiento', true, DATE '2020-01-01', NULL),
  ('F329', 'Episodio depresivo, no especificado', true, DATE '2020-01-01', NULL),
  ('F419', 'Trastorno de ansiedad, no especificado', true, DATE '2020-01-01', NULL),
  ('G439', 'Migraña, no especificada', true, DATE '2020-01-01', NULL),
  ('G442', 'Cefalea debida a tensión', true, DATE '2020-01-01', NULL),
  ('H109', 'Conjuntivitis, no especificada', true, DATE '2020-01-01', NULL),
  ('L209', 'Dermatitis atópica, no especificada', true, DATE '2020-01-01', NULL),
  ('L309', 'Dermatitis, no especificada', true, DATE '2020-01-01', NULL),
  ('Z012', 'Examen odontológico', true, DATE '2020-01-01', NULL),
  ('Z014', 'Examen ginecológico (general) (de rutina)', true, DATE '2020-01-01', NULL),
  ('Z760', 'Emisión de prescripción de repetición', true, DATE '2020-01-01', NULL)
ON CONFLICT (codigo) DO UPDATE
  SET descripcion        = EXCLUDED.descripcion,
      activo             = EXCLUDED.activo,
      vigente_desde      = EXCLUDED.vigente_desde,
      vigente_hasta      = EXCLUDED.vigente_hasta,
      fecha_modificacion = now();

-- 2.7 Catálogo Maestro de Procedimientos CUPS (38 códigos con vigencia Fase 1)
INSERT INTO procedimientos_cups (codigo, descripcion, requiere_consentimiento, activo, vigente_desde, vigente_hasta) VALUES
  -- Procedimientos de consulta y exámenes comunes
  ('890201', 'Consulta de primera vez por medicina general', false, true, DATE '2020-01-01', NULL),
  ('895100', 'Electrocardiograma de ritmo o de superficie', false, true, DATE '2020-01-01', NULL),
  ('902210', 'Hemograma IV (automatizado)', false, true, DATE '2020-01-01', NULL),
  ('903841', 'Glucosa en suero u otro fluido diferente a orina', false, true, DATE '2020-01-01', NULL),
  ('890301', 'Consulta de control o seguimiento por medicina general', false, true, DATE '2020-01-01', NULL),
  ('871010', 'Radiografía de tórax (PA o AP)', false, true, DATE '2020-01-01', NULL),
  ('906913', 'Perfil lipídico', false, true, DATE '2020-01-01', NULL),
  -- Procedimientos clínicos y diagnósticos complementarios
  ('890202', 'Consulta de primera vez por medicina especializada', false, true, DATE '2020-01-01', NULL),
  ('890302', 'Consulta de control o seguimiento por medicina especializada', false, true, DATE '2020-01-01', NULL),
  ('890701', 'Consulta de urgencias por medicina general', false, true, DATE '2020-01-01', NULL),
  ('903895', 'Creatinina en suero u otros fluidos', false, true, DATE '2020-01-01', NULL),
  ('903866', 'Nitrógeno ureico (BUN)', false, true, DATE '2020-01-01', NULL),
  ('903843', 'Hemoglobina glicosilada (HbA1c)', false, true, DATE '2020-01-01', NULL),
  ('907106', 'Uroanálisis con sedimento y densidad urinaria', false, true, DATE '2020-01-01', NULL),
  ('903868', 'Ácido úrico en suero u otros fluidos', false, true, DATE '2020-01-01', NULL),
  ('903818', 'Colesterol total', false, true, DATE '2020-01-01', NULL),
  ('903815', 'Colesterol de alta densidad (HDL)', false, true, DATE '2020-01-01', NULL),
  ('903816', 'Colesterol de baja densidad (LDL)', false, true, DATE '2020-01-01', NULL),
  ('903864', 'Triglicéridos', false, true, DATE '2020-01-01', NULL),
  ('904903', 'Hormona estimulante del tiroides (TSH)', false, true, DATE '2020-01-01', NULL),
  ('904902', 'Tiroxina libre (T4 libre)', false, true, DATE '2020-01-01', NULL),
  ('906422', 'Prueba treponémica rápida (sífilis)', false, true, DATE '2020-01-01', NULL),
  ('906249', 'Prueba rápida para VIH 1 y 2', false, true, DATE '2020-01-01', NULL),
  ('906041', 'Prueba de embarazo en orina o suero', false, true, DATE '2020-01-01', NULL),
  ('873111', 'Radiografía de columna lumbosacra (AP y lateral)', false, true, DATE '2020-01-01', NULL),
  ('871121', 'Radiografía de senos paranasales', false, true, DATE '2020-01-01', NULL),
  ('881232', 'Ecografía abdominal total', false, true, DATE '2020-01-01', NULL),
  ('881201', 'Ecografía pélvica ginecológica transvaginal', false, true, DATE '2020-01-01', NULL),
  ('881210', 'Ecografía de tiroides', false, true, DATE '2020-01-01', NULL),
  ('881234', 'Ecografía de vías urinarias (riñones, vejiga y próstata)', false, true, DATE '2020-01-01', NULL),
  ('881301', 'Ecografía obstétrica transabdominal', false, true, DATE '2020-01-01', NULL),
  ('893805', 'Espirometría clínica', false, true, DATE '2020-01-01', NULL),
  ('894102', 'Prueba de esfuerzo cardiovascular', false, true, DATE '2020-01-01', NULL),
  ('895001', 'Monitoreo electrocardiográfico continuo (Holter 24 horas)', false, true, DATE '2020-01-01', NULL),
  ('896100', 'Monitoreo ambulatorio de presión arterial (MAPA)', false, true, DATE '2020-01-01', NULL),
  -- Procedimientos invasivos con requerimiento obligatorio de consentimiento informado
  ('451600', 'Esofagogastroduodenoscopia [EGD] con o sin biopsia', true, true, DATE '2020-01-01', NULL),
  ('452300', 'Colonoscopia total con o sin biopsia', true, true, DATE '2020-01-01', NULL),
  ('861201', 'Biopsia de piel y tejido celular subcutáneo por escisión', true, true, DATE '2020-01-01', NULL)
ON CONFLICT (codigo) DO UPDATE
  SET descripcion             = EXCLUDED.descripcion,
      requiere_consentimiento = EXCLUDED.requiere_consentimiento,
      activo                  = EXCLUDED.activo,
      vigente_desde           = EXCLUDED.vigente_desde,
      vigente_hasta           = EXCLUDED.vigente_hasta,
      fecha_modificacion      = now();

-- ----------------------------------------------------------------------------
-- FASE 3: CONFIGURACIÓN DE AGENDAS MÉDICAS SEMANALES (L-V y Sábado mañana)
-- ----------------------------------------------------------------------------
INSERT INTO agendas_medicas (medico_id, dia_semana, hora_inicio, hora_fin, duracion_cita)
SELECT u.id, d, cfg.h_ini::time, cfg.h_fin::time, cfg.dur
FROM (VALUES
  ('aperez@hiscare.edu.co',    1, 5, '07:00', '13:00', 20),
  ('cgarcia@hiscare.edu.co',   1, 5, '08:00', '14:00', 30),
  ('smartinez@hiscare.edu.co', 1, 5, '07:00', '13:00', 20),
  ('rgomez@hiscare.edu.co',    1, 5, '08:00', '15:00', 30),
  ('fcastro@hiscare.edu.co',   1, 5, '08:00', '14:00', 30),
  ('mospina@hiscare.edu.co',   1, 5, '12:00', '18:00', 20),
  ('jrestrepo@hiscare.edu.co', 1, 5, '13:00', '18:00', 20),
  ('lvalencia@hiscare.edu.co', 1, 5, '13:00', '18:00', 30),
  -- Franjas de sábado en la mañana para 4 profesionales
  ('aperez@hiscare.edu.co',    6, 6, '08:00', '12:00', 20),
  ('cgarcia@hiscare.edu.co',   6, 6, '08:00', '12:00', 30),
  ('smartinez@hiscare.edu.co', 6, 6, '08:00', '12:00', 20),
  ('jrestrepo@hiscare.edu.co', 6, 6, '08:00', '12:00', 20)
) AS cfg(email, d_ini, d_fin, h_ini, h_fin, dur)
JOIN usuarios u ON u.email = cfg.email
CROSS JOIN LATERAL generate_series(cfg.d_ini, cfg.d_fin) AS d;

-- ----------------------------------------------------------------------------
-- FASE 4: PACIENTES BASE + CENSO IPS MEDIANA (200 PACIENTES TOTALES)
-- (Incluye el paciente institucional CC 1234567890 como ÚNICO afiliado a EPS Sanitas)
-- ----------------------------------------------------------------------------
INSERT INTO pacientes (id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, telefono, direccion) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'CC', '1018456789', 'Carlos Eduardo', 'Gómez Silva',    '1984-06-12', 'M', '+57 311 234 5678', 'Calle 127 # 45-18, Bogotá'),
  ('a0000001-0000-0000-0000-000000000002', 'CC', '52489632',   'Martha Lucía',   'Restrepo Cano',  '1968-11-25', 'F', '+57 315 890 1234', 'Carrera 68 # 98-34, Bogotá'),
  ('a0000001-0000-0000-0000-000000000003', 'TI', '1098765432', 'Valentina',      'Morales Castro', '2010-03-18', 'F', '+57 300 456 7891', 'Transversal 78 # 12-50, Bogotá'),
  ('a0000001-0000-0000-0000-000000000004', 'CC', '79845123',   'Jorge Enrique',  'Torres Méndez',  '1959-08-30', 'M', '+57 317 654 3210', 'Av Boyacá # 116-40, Bogotá'),
  ('a0000001-0000-0000-0000-000000000005', 'RC', '1122334455', 'Samuel David',   'Henao Peña',     '2020-04-14', 'M', '+57 320 123 4567', 'Calle 80 # 72-15, Bogotá'),
  ('a0000001-0000-0000-0000-000000000006', 'CE', '456789012',  'Jean Paul',      'Laurent Dupont', '1991-09-05', 'M', '+57 301 987 6543', 'Carrera 11 # 82-20, Bogotá'),
  ('a0000001-0000-0000-0000-000000000007', 'CC', '1023456789', 'Andrea Marcela', 'Quintero Ruiz',  '1997-01-20', 'F', '+57 314 234 5678', 'Diagonal 45 # 20-30, Bogotá'),
  ('a0000001-0000-0000-0000-000000000008', 'CC', '80123456',   'Fernando',       'Rincón Ortiz',   '1975-07-10', 'M', '+57 318 765 4321', 'Calle 134 # 19-50, Bogotá'),
  ('a0000001-0000-0000-0000-000000000009', 'CC', '1234567890', 'Juan Diego',     'Pérez García',   '1985-05-15', 'M', '+57 300 123 4567', 'Cra 15 # 85-20, Bogotá');

-- Historias clínicas base (fecha_apertura <= 2026-10-01)
INSERT INTO historias_clinicas (id, paciente_id, fecha_apertura) VALUES
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', '2026-10-01'),
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002', '2026-10-01'),
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000003', '2026-10-01'),
  ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000004', '2026-10-01'),
  ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000005', '2026-10-01'),
  ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000006', '2026-10-01'),
  ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000007', '2026-10-01'),
  ('b0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000008', '2026-10-01'),
  ('b0000001-0000-0000-0000-000000000009', 'a0000001-0000-0000-0000-000000000009', '2026-10-01');

-- Contactos de emergencia base
INSERT INTO contactos_emergencia (paciente_id, nombre, parentesco, telefono) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Sandra Milena Prada',     'Esposa',  '+57 312 876 5432'),
  ('a0000001-0000-0000-0000-000000000002', 'Andrés Felipe Restrepo',  'Hijo',    '+57 310 456 7890'),
  ('a0000001-0000-0000-0000-000000000003', 'Patricia Castro Beltrán', 'Madre',   '+57 316 789 0123'),
  ('a0000001-0000-0000-0000-000000000004', 'Clara Inés Silva',        'Cónyuge', '+57 318 901 2345'),
  ('a0000001-0000-0000-0000-000000000005', 'Carolina Peña Romero',    'Madre',   '+57 321 654 9870'),
  ('a0000001-0000-0000-0000-000000000006', 'Emilie Laurent',          'Hermana', '+57 302 345 6789'),
  ('a0000001-0000-0000-0000-000000000007', 'Mauricio Quintero',       'Padre',   '+57 313 789 4561'),
  ('a0000001-0000-0000-0000-000000000008', 'Luz Marina Duque',        'Esposa',  '+57 319 876 5432'),
  ('a0000001-0000-0000-0000-000000000009', 'Marta Rodríguez',         'Esposa',  '+57 310 987 6543');

-- Afiliaciones a EPS / Aseguradoras base
-- NOTA C.14: Únicamente CC 1234567890 (Juan Diego Pérez García) queda afiliado a EPS Sanitas.
INSERT INTO paciente_aseguradora (paciente_id, aseguradora_id, tipo_usuario, numero_contrato, fecha_inicio, fecha_fin)
SELECT p.paciente_id, a.id, p.tipo_usuario, p.numero_contrato, p.fecha_inicio, p.fecha_fin
FROM (VALUES
  ('a0000001-0000-0000-0000-000000000001'::uuid, 'Nueva EPS',         'Cotizante'::varchar,    'CON-6789-2026'::varchar,   '2026-01-01'::date, '2026-12-31'::date),
  ('a0000001-0000-0000-0000-000000000002'::uuid, 'Compensar EPS',     'Cotizante'::varchar,    'CON-9632-2026'::varchar,   '2026-01-01'::date, '2026-12-31'::date),
  ('a0000001-0000-0000-0000-000000000003'::uuid, 'Nueva EPS',         'Beneficiario'::varchar, 'CON-5432-2026'::varchar,   '2026-01-01'::date, '2026-12-31'::date),
  ('a0000001-0000-0000-0000-000000000004'::uuid, 'Particular',        'Particular'::varchar,   'CON-5123-2026'::varchar,   '2026-01-01'::date, '2026-12-31'::date),
  ('a0000001-0000-0000-0000-000000000005'::uuid, 'Compensar EPS',     'Beneficiario'::varchar, 'CON-4455-2026'::varchar,   '2026-01-01'::date, '2026-12-31'::date),
  ('a0000001-0000-0000-0000-000000000006'::uuid, 'Particular',        'Particular'::varchar,   'CON-9012-2026'::varchar,   '2026-01-01'::date, '2026-12-31'::date),
  ('a0000001-0000-0000-0000-000000000007'::uuid, 'Capital Salud EPS', 'Cotizante'::varchar,    'CON-6789-2026'::varchar,   '2026-01-01'::date, '2026-12-31'::date),
  ('a0000001-0000-0000-0000-000000000008'::uuid, 'Fuerzas Militares', 'Cotizante'::varchar,    'CON-3456-2026'::varchar,   '2026-01-01'::date, '2026-12-31'::date),
  ('a0000001-0000-0000-0000-000000000009'::uuid, 'EPS Sanitas',       'Cotizante'::varchar,    'SAN-2026-004512'::varchar, '2026-01-01'::date, '2026-12-31'::date)
) AS p(paciente_id, aseguradora_nom, tipo_usuario, numero_contrato, fecha_inicio, fecha_fin)
JOIN aseguradoras a ON a.nombre = p.aseguradora_nom;

-- Antecedentes clínicos base
INSERT INTO antecedentes (historia_id, tipo, descripcion) VALUES
  ('b0000001-0000-0000-0000-000000000001', 'Patologico',    'Hipertensión arterial esencial diagnosticada en 2021.'),
  ('b0000001-0000-0000-0000-000000000001', 'Farmacologico', 'Losartán 50mg cada 12h; Amlodipino 5mg día.'),
  ('b0000001-0000-0000-0000-000000000001', 'Alergico',      'Alergia cutánea a la Penicilina.'),
  ('b0000001-0000-0000-0000-000000000002', 'Patologico',    'Diabetes Mellitus Tipo 2 diagnosticada hace 8 años; Obesidad grado I.'),
  ('b0000001-0000-0000-0000-000000000002', 'Familiar',      'Madre con DM2 e infarto agudo de miocardio a los 65 años.'),
  ('b0000001-0000-0000-0000-000000000003', 'Patologico',    'Asma bronquial de inicio infantil; rinitis alérgica perenne.'),
  ('b0000001-0000-0000-0000-000000000003', 'Farmacologico', 'Salbutamol inhalador a demanda; Beclometasona nasal.'),
  ('b0000001-0000-0000-0000-000000000009', 'Patologico',    'Hipertensión arterial en estudio desde 2025; cefalea tensional episódica.');

-- ----------------------------------------------------------------------------
-- FASE 5: GENERADOR DETERMINISTA DE IPS MEDIANA (2026-10-01 AL 2026-12-15)
-- ----------------------------------------------------------------------------
DO $seed$
DECLARE
  -- Referencias de personal institucional
  v_med_perez      uuid := (SELECT id FROM usuarios WHERE email = 'aperez@hiscare.edu.co');
  v_med_garcia     uuid := (SELECT id FROM usuarios WHERE email = 'cgarcia@hiscare.edu.co');
  v_med_martinez   uuid := (SELECT id FROM usuarios WHERE email = 'smartinez@hiscare.edu.co');
  v_med_gomez      uuid := (SELECT id FROM usuarios WHERE email = 'rgomez@hiscare.edu.co');
  v_med_castro     uuid := (SELECT id FROM usuarios WHERE email = 'fcastro@hiscare.edu.co');
  v_med_ospina     uuid := (SELECT id FROM usuarios WHERE email = 'mospina@hiscare.edu.co');
  v_med_restrepo   uuid := (SELECT id FROM usuarios WHERE email = 'jrestrepo@hiscare.edu.co');
  v_med_valencia   uuid := (SELECT id FROM usuarios WHERE email = 'lvalencia@hiscare.edu.co');

  v_medicos        uuid[];
  v_med_esp        text[] := ARRAY[
    'Medicina interna',  -- aperez
    'Medicina general',  -- cgarcia
    'Pediatria',         -- smartinez
    'Ginecologia',       -- rgomez
    'Cardiologia',       -- fcastro
    'Medicina interna',  -- mospina
    'Pediatria',         -- jrestrepo
    'Medicina general'   -- lvalencia
  ];

  v_enfermeros     uuid[];
  v_aseguradoras   uuid[];
  v_aseg_nombres   text[];

  -- Catálogos cargados en memoria para búsqueda veloz
  v_cie_gen        uuid[];
  v_cie_int        uuid[];
  v_cie_ped        uuid[];
  v_cie_gin        uuid[];
  v_cie_car        uuid[];
  v_cie_sec        uuid[];

  v_cups_cons_gen  uuid;
  v_cups_ctrl_gen  uuid;
  v_cups_cons_esp  uuid;
  v_cups_ctrl_esp  uuid;
  v_cups_proc_no   uuid[];
  v_cups_proc_cons uuid[];
  v_cups_lab       uuid[];
  v_cups_rad       uuid[];

  -- Arreglos de nombres colombianos realistas
  v_nom_m          text[] := ARRAY[
    'Santiago','Mateo','Sebastián','Alejandro','Nicolás','Samuel','Daniel','David',
    'Andrés Felipe','Juan José','Juan Pablo','Carlos Andrés','Luis Fernando','Diego Armando',
    'Camilo Andrés','Cristian David','Julián Esteban','Esteban','Gabriel','Tomás',
    'Sergio Alejandro','Miguel Ángel','Óscar Iván','Héctor Fabio','Jorge Iván','Mauricio',
    'Ricardo','Eduardo','Hernán','Álvaro','Gustavo Adolfo','Rodrigo','Jaime','Rafael',
    'Pedro Nel','Fabio','Víctor Manuel','Germán','Jairo','Néstor'
  ];
  v_nom_f          text[] := ARRAY[
    'Sofía','Valentina','Isabella','Mariana','Camila','Luciana','Salomé','Gabriela',
    'María José','Laura Sofía','Paula Andrea','Daniela','Natalia','Juliana','Carolina',
    'Andrea','Diana Marcela','Claudia Patricia','Mónica','Sandra Milena','Luz Marina',
    'Martha Cecilia','Gloria Inés','Beatriz','Rosa Elena','Yolanda','Liliana','Adriana',
    'Paola','Tatiana','Angélica','Alejandra','Catalina','Manuela','Valeria','Sara',
    'María Fernanda','Luisa Fernanda','Ana María','Clara Inés'
  ];
  v_apellidos      text[] := ARRAY[
    'Rodríguez','Gómez','Martínez','López','González','Hernández','García','Sánchez',
    'Ramírez','Torres','Díaz','Vargas','Castro','Ruiz','Morales','Jiménez','Ortiz',
    'Gutiérrez','Rojas','Moreno','Muñoz','Álvarez','Romero','Herrera','Medina',
    'Aguilar','Valencia','Restrepo','Ospina','Cardona','Salazar','Jaramillo','Mejía',
    'Quintero','Arias','Bedoya','Montoya','Giraldo','Castaño','Escobar','Pineda',
    'Peña','Rincón','Duque','Cárdenas','Mendoza','Suárez','Ríos','Parra','Becerra'
  ];
  v_vias           text[] := ARRAY['Calle','Carrera','Avenida','Diagonal','Transversal'];
  v_ciudades       text[] := ARRAY['Bogotá D.C.','Medellín','Cali','Barranquilla','Bucaramanga','Pereira','Manizales','Chía','Soacha'];
  v_parentescos    text[] := ARRAY['Madre','Padre','Esposo(a)','Hijo(a)','Hermano(a)','Tío(a)'];
  v_ant_tipos      text[] := ARRAY['Patologico','Quirurgico','Alergico','Farmacologico','Familiar','Ginecologico'];

  -- Arreglos de textos clínicos por especialidad
  v_motivos_gen    text[] := ARRAY[
    'Cuadro de rinorrea hialina, odinofagia y malestar general de 48 horas.',
    'Cefalea opresiva frontotemporal asociada a estrés laboral y fatiga.',
    'Dolor lumbar mecánico irradiado a región glútea tras esfuerzo físico.',
    'Epigastralgia urente posprandial con pirosis de 5 días de evolución.',
    'Control de signos vitales y renovación de fórmula médica mensual.',
    'Episodios de mareo postural y astenia progresiva en la última semana.',
    'Prurito y lesiones eritematosas descamativas en pliegues de antebrazos.',
    'Ardor ocular bilateral con hiperemia conjuntival y secreción mucosa.'
  ];
  v_motivos_int    text[] := ARRAY[
    'Control metabólico trimestral de diabetes mellitus tipo 2 e hipertensión.',
    'Seguimiento de cifras tensionales elevadas en automonitoreo domiciliario.',
    'Disnea de moderados esfuerzos y tos productiva crónica en paciente con EPOC.',
    'Astenia, intolerancia al frío y ganancia ponderal en estudio tiroideo.',
    'Revisión de perfil lipídico y ajuste de estatinas por dislipidemia mixta.',
    'Control de función renal y depuración de creatinina en consulta programada.'
  ];
  v_motivos_ped    text[] := ARRAY[
    'Control de crecimiento, desarrollo pondoestatural y esquema de vacunación.',
    'Cuadro febril de 38.5 °C de 24 horas con tos seca y congestión nasal.',
    'Sibilancias espiratorias leves nocturnas y tos emetizante en menor.',
    'Dolor abdominal cólico periumbilical con dos deposiciones líquidas.',
    'Odinofagia aguda, rechazo parcial de alimentos y eritema faríngeo.'
  ];
  v_motivos_gin    text[] := ARRAY[
    'Control ginecológico anual y toma de citología cervicouterina.',
    'Disuria terminal, polaquiuria y dolor suprapúbico de 36 horas.',
    'Irregularidad menstrual con ciclos prolongados en los últimos 3 meses.',
    'Dolor pélvico crónico leve en estudio ecográfico ambulatorio.',
    'Valoración preconcepcional y consejería de salud reproductiva.'
  ];
  v_motivos_car    text[] := ARRAY[
    'Dolor torácico opresivo atípico sin irradiación durante esfuerzo leve.',
    'Control cardiológico de cardiopatía hipertensiva con reporte de Holter.',
    'Palpitaciones intermitentes autolimitadas asociadas a mareo ocasional.',
    'Seguimiento de enfermedad coronaria estable y adherencia a antiagregación.',
    'Edema maleolar vespertino bilateral y disnea paroxística en estudio.'
  ];

  -- Variables de trabajo para generación
  v_idx            integer;
  v_pac_id         uuid;
  v_hist_id        uuid;
  v_sexo           varchar(15);
  v_edad           integer;
  v_fnac           date;
  v_tdoc           varchar(5);
  v_ndoc           varchar(20);
  v_noms           varchar(100);
  v_apes           varchar(100);
  v_tel            varchar(20);
  v_dir            varchar(200);
  v_aseg_idx       integer;
  v_tusu           varchar(20);
  v_ant_desc       text;
  v_ant_tipo       varchar(20);

  -- Variables para calendario y citas
  v_fecha_dia      date;
  v_dow            integer;
  v_med_idx        integer;
  v_med_id         uuid;
  v_esp_med        text;
  v_dur            integer;
  v_h_ini          time;
  v_h_fin          time;
  v_slot_ts        timestamp;
  v_citas_dia      integer;
  v_picked_pac     uuid;
  v_picked_hist    uuid;
  v_picked_sexo    varchar(15);
  v_picked_edad    integer;
  v_estado_cita    varchar(15);
  v_cita_id        uuid;
  v_cita_reprog_id uuid;
  v_reprog_ts      timestamp;
  v_at_id          uuid;
  v_orden_id       uuid;
  v_res_id         uuid;
  v_enf_id         uuid;
  v_cie_prin       uuid;
  v_cie_sec_id     uuid;
  v_cups_cons      uuid;
  v_cups_proc      uuid;
  v_req_cons       boolean;
  v_proc_desc      text;
  v_motivo         text;
  v_subjetivo      text;
  v_objetivo       text;
  v_analisis       text;
  v_plan           text;
  v_ps             integer;
  v_pd             integer;
  v_fc             integer;
  v_fr             integer;
  v_temp           numeric(4,1);
  v_sat            integer;
  v_peso           numeric(5,2);
  v_talla          numeric(5,2);
  v_tipo_ord       varchar(12);
  v_sist_dest      varchar(50);
  v_ord_estado     varchar(12);
  v_roll           double precision;
  v_abiertas_count integer := 0;
  v_adendas_count  integer := 0;
  v_total_citas    integer := 0;
  v_slot_offset    integer;
  v_max_slots      integer;
  v_secciones      text[] := ARRAY['soap','alta','orden','motivo'];

  -- IDs base de los 8 casos demostrativos originales
  v_c1 uuid := 'c0000001-0000-0000-0000-000000000001';
  v_c2 uuid := 'c0000001-0000-0000-0000-000000000002';
  v_c3 uuid := 'c0000001-0000-0000-0000-000000000003';
  v_c4 uuid := 'c0000001-0000-0000-0000-000000000004';
  v_c6 uuid := 'c0000001-0000-0000-0000-000000000006';
  v_c7 uuid := 'c0000001-0000-0000-0000-000000000007';
  v_c8 uuid := 'c0000001-0000-0000-0000-000000000008';

  v_at1 uuid := 'd0000001-0000-0000-0000-000000000001';
  v_at2 uuid := 'd0000001-0000-0000-0000-000000000002';
  v_at3 uuid := 'd0000001-0000-0000-0000-000000000003';
  v_at6 uuid := 'd0000001-0000-0000-0000-000000000006';
  v_at7 uuid := 'd0000001-0000-0000-0000-000000000007';
  v_at8 uuid := 'd0000001-0000-0000-0000-000000000008';

  v_ord1 uuid := 'e0000001-0000-0000-0000-000000000001';
  v_ord3 uuid := 'e0000001-0000-0000-0000-000000000003';
  v_ord7 uuid := 'e0000001-0000-0000-0000-000000000007';

  v_res1 uuid := 'f0000001-0000-0000-0000-000000000001';
  v_res3 uuid := 'f0000001-0000-0000-0000-000000000003';
  v_rec  record;
BEGIN
  PERFORM setseed(0.42);

  v_medicos := ARRAY[
    v_med_perez, v_med_garcia, v_med_martinez, v_med_gomez,
    v_med_castro, v_med_ospina, v_med_restrepo, v_med_valencia
  ];

  SELECT array_agg(u.id ORDER BY u.email)
    INTO v_enfermeros
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
   WHERE r.nombre = 'ENFERMERO' AND u.activo = true;

  -- Aseguradoras EXCLUYENDO 'EPS Sanitas' para respetar invariante C.14 (exactamente 1 afiliado)
  SELECT array_agg(id ORDER BY nombre), array_agg(nombre ORDER BY nombre)
    INTO v_aseguradoras, v_aseg_nombres
    FROM aseguradoras
   WHERE nombre <> 'EPS Sanitas' AND activo = true;

  -- Cargar catálogos CIE-10 por grupo clínico
  SELECT array_agg(id ORDER BY codigo) INTO v_cie_gen
    FROM diagnosticos_cie10
   WHERE codigo IN ('J00X','J029','J069','K297','M545','M542','G439','G442','R51X','Z000','L309','H109','A09X','R53X');

  SELECT array_agg(id ORDER BY codigo) INTO v_cie_int
    FROM diagnosticos_cie10
   WHERE codigo IN ('I10X','E119','E039','E780','E782','E785','E669','J449','K219','N189');

  SELECT array_agg(id ORDER BY codigo) INTO v_cie_ped
    FROM diagnosticos_cie10
   WHERE codigo IN ('Z000','J00X','J039','J209','J459','A09X','R509','L209');

  SELECT array_agg(id ORDER BY codigo) INTO v_cie_gin
    FROM diagnosticos_cie10
   WHERE codigo IN ('Z014','N390','E039','R104','K589','Z760');

  SELECT array_agg(id ORDER BY codigo) INTO v_cie_car
    FROM diagnosticos_cie10
   WHERE codigo IN ('I10X','I119','I150','I209','I251','I509','R074','R42X');

  SELECT array_agg(id ORDER BY codigo) INTO v_cie_sec
    FROM diagnosticos_cie10
   WHERE codigo IN ('E669','E785','R51X','R53X','R42X','K297','M791','F419','Z760');

  -- Cargar CUPS
  SELECT id INTO v_cups_cons_gen FROM procedimientos_cups WHERE codigo = '890201';
  SELECT id INTO v_cups_ctrl_gen FROM procedimientos_cups WHERE codigo = '890301';
  SELECT id INTO v_cups_cons_esp FROM procedimientos_cups WHERE codigo = '890202';
  SELECT id INTO v_cups_ctrl_esp FROM procedimientos_cups WHERE codigo = '890302';

  SELECT array_agg(id ORDER BY codigo) INTO v_cups_proc_no
    FROM procedimientos_cups WHERE codigo IN ('895100','893805','894102','895001','896100');

  SELECT array_agg(id ORDER BY codigo) INTO v_cups_proc_cons
    FROM procedimientos_cups WHERE requiere_consentimiento = true;

  SELECT array_agg(id ORDER BY codigo) INTO v_cups_lab
    FROM procedimientos_cups
   WHERE codigo IN ('902210','903841','906913','903895','903866','903843','907106','903868','903818','904903');

  SELECT array_agg(id ORDER BY codigo) INTO v_cups_rad
    FROM procedimientos_cups
   WHERE codigo IN ('871010','873111','871121','881232','881201','881210','881234');

  -- --------------------------------------------------------------------------
  -- 1. GENERAR 191 PACIENTES ADICIONALES (TOTAL = 200 PACIENTES)
  -- --------------------------------------------------------------------------
  FOR v_idx IN 10..200 LOOP
    v_pac_id  := ('a0000001-0000-0000-0000-' || lpad(v_idx::text, 12, '0'))::uuid;
    v_hist_id := ('b0000001-0000-0000-0000-' || lpad(v_idx::text, 12, '0'))::uuid;

    v_sexo := CASE WHEN (v_idx % 2) = 0 THEN 'F' ELSE 'M' END;

    -- Distribución etaria realista: 15% pediátricos (1-17), 55% adultos (18-59), 30% mayores (60-82)
    IF (v_idx % 7) = 0 THEN
      v_edad := 2 + ((v_idx * 3) % 15);
    ELSIF (v_idx % 3) = 0 THEN
      v_edad := 60 + ((v_idx * 5) % 23);
    ELSE
      v_edad := 19 + ((v_idx * 7) % 41);
    END IF;

    v_fnac := (DATE '2026-10-01' - (v_edad * 365 + (v_idx * 17) % 360))::date;

    IF v_edad < 7 THEN
      v_tdoc := 'RC';
      v_ndoc := '115' || lpad((1000000 + v_idx * 137)::text, 7, '0');
    ELSIF v_edad < 18 THEN
      v_tdoc := 'TI';
      v_ndoc := '109' || lpad((2000000 + v_idx * 149)::text, 7, '0');
    ELSIF (v_idx % 23) = 0 THEN
      v_tdoc := 'CE';
      v_ndoc := '48' || lpad((300000 + v_idx * 113)::text, 6, '0');
    ELSE
      v_tdoc := 'CC';
      IF v_edad >= 50 THEN
        v_ndoc := (51000000 + v_idx * 14731)::text;
      ELSE
        v_ndoc := '10' || lpad((10000000 + v_idx * 27913)::text, 8, '0');
      END IF;
    END IF;

    IF v_sexo = 'F' THEN
      v_noms := v_nom_f[1 + ((v_idx * 3) % array_length(v_nom_f, 1))];
    ELSE
      v_noms := v_nom_m[1 + ((v_idx * 3) % array_length(v_nom_m, 1))];
    END IF;

    v_apes := v_apellidos[1 + ((v_idx * 5) % array_length(v_apellidos, 1))]
           || ' '
           || v_apellidos[1 + ((v_idx * 11 + 7) % array_length(v_apellidos, 1))];

    v_tel := '+57 3' || lpad((10 + (v_idx % 15))::text, 2, '0')
          || ' ' || lpad((100 + (v_idx * 37) % 899)::text, 3, '0')
          || ' ' || lpad((1000 + (v_idx * 193) % 8999)::text, 4, '0');

    v_dir := v_vias[1 + (v_idx % array_length(v_vias, 1))]
          || ' ' || (10 + (v_idx * 7) % 160)::text
          || ' # ' || (10 + (v_idx * 3) % 89)::text
          || '-' || (10 + (v_idx * 11) % 89)::text
          || ', ' || v_ciudades[1 + (v_idx % array_length(v_ciudades, 1))];

    INSERT INTO pacientes (id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, telefono, direccion)
    VALUES (v_pac_id, v_tdoc, v_ndoc, v_noms, v_apes, v_fnac, v_sexo, v_tel, v_dir);

    INSERT INTO historias_clinicas (id, paciente_id, fecha_apertura)
    VALUES (v_hist_id, v_pac_id, DATE '2026-10-01');

    INSERT INTO contactos_emergencia (paciente_id, nombre, parentesco, telefono)
    VALUES (
      v_pac_id,
      CASE WHEN v_sexo = 'F' THEN v_nom_m[1 + ((v_idx + 5) % array_length(v_nom_m, 1))]
           ELSE v_nom_f[1 + ((v_idx + 5) % array_length(v_nom_f, 1))] END
        || ' ' || split_part(v_apes, ' ', 1),
      v_parentescos[1 + (v_idx % array_length(v_parentescos, 1))],
      '+57 3' || lpad((11 + (v_idx % 14))::text, 2, '0')
        || ' ' || lpad((200 + (v_idx * 41) % 799)::text, 3, '0')
        || ' ' || lpad((1000 + (v_idx * 257) % 8999)::text, 4, '0')
    );

    v_aseg_idx := 1 + (v_idx % array_length(v_aseguradoras, 1));
    v_tusu := CASE
      WHEN v_aseg_nombres[v_aseg_idx] = 'Particular' THEN 'Particular'
      WHEN v_edad < 18 OR (v_idx % 4) = 0 THEN 'Beneficiario'
      ELSE 'Cotizante'
    END;

    INSERT INTO paciente_aseguradora (paciente_id, aseguradora_id, tipo_usuario, numero_contrato, fecha_inicio, fecha_fin, activo)
    VALUES (
      v_pac_id,
      v_aseguradoras[v_aseg_idx],
      v_tusu,
      'CON-' || lpad((10000 + v_idx * 17)::text, 5, '0') || '-2026',
      DATE '2026-01-01',
      DATE '2026-12-31',
      true
    );

    -- Antecedentes clínicos (~80% de los pacientes -> ~153 registros adicionales + 8 base = ~161)
    IF (v_idx % 5) <> 0 THEN
      v_ant_tipo := v_ant_tipos[1 + (v_idx % (CASE WHEN v_sexo = 'F' AND v_edad >= 15 THEN 6 ELSE 5 END))];
      v_ant_desc := CASE v_ant_tipo
        WHEN 'Patologico'    THEN CASE WHEN v_edad >= 45 THEN 'Hipertensión arterial estadio 1 y dislipidemia en control.' ELSE 'Rinitis alérgica estacional y episodios de migraña leve.' END
        WHEN 'Quirurgico'    THEN CASE WHEN (v_idx % 2) = 0 THEN 'Apendicectomía laparoscópica sin complicaciones.' ELSE 'Colecistectomía previa; adecuada evolución posoperatoria.' END
        WHEN 'Alergico'      THEN CASE WHEN (v_idx % 2) = 0 THEN 'Hipersensibilidad cutánea a sulfonamidas.' ELSE 'Alergia respiratoria a ácaros del polvo y polen.' END
        WHEN 'Farmacologico' THEN CASE WHEN v_edad >= 50 THEN 'Losartán 50 mg/día; Atorvastatina 20 mg noche.' ELSE 'Omeprazol 20 mg en ayunas por síntomas dispépticos.' END
        WHEN 'Familiar'      THEN 'Antecedente familiar en primer grado de diabetes mellitus tipo 2.'
        ELSE 'Menarquia a los 12 años; ciclos regulares 28x4 días, sin gestaciones de alto riesgo.'
      END;
      INSERT INTO antecedentes (historia_id, tipo, descripcion)
      VALUES (v_hist_id, v_ant_tipo, v_ant_desc);
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------------
  -- 2. CASOS DEMOSTRATIVOS BASE PRESERVADOS (02 al 16 de Octubre de 2026)
  -- --------------------------------------------------------------------------
  -- CASO 8: 16 Octubre 2026 - Atención ABIERTA con borrador SOAP
  INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado)
  VALUES (v_c8, 'a0000001-0000-0000-0000-000000000007', v_med_perez, '2026-10-16 08:00:00', 20, 'CONFIRMADA');

  INSERT INTO atenciones (id, historia_id, medico_id, cita_id, fecha, motivo_consulta, estado)
  VALUES (v_at8, 'b0000001-0000-0000-0000-000000000007', v_med_perez, v_c8, '2026-10-16 08:05:00',
          'Disuria y polaquiuria de 24 horas de evolución con dolor suprapúbico.', 'ABIERTA');

  INSERT INTO signos_vitales (atencion_id, presion_sistolica, presion_diastolica, frecuencia_cardiaca,
                              frecuencia_respiratoria, temperatura_celsius, saturacion_oxigeno, peso_kg, talla_cm)
  VALUES (v_at8, 118, 76, 78, 16, 37.1, 98, 58.0, 165.0);

  INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
  SELECT v_at8, id, 'PRINCIPAL' FROM diagnosticos_cie10 WHERE codigo = 'N390' LIMIT 1;

  INSERT INTO infra.borradores (usuario_id, atencion_id, seccion, contenido)
  VALUES (v_med_perez, v_at8, 'soap',
          '{"subjetivo": "Paciente refiere ardor al orinar de inicio subito sin fiebre.", "objetivo": "Abdomen blando, doloroso a la palpacion en hipogastrio sin signos peritoneales."}'::jsonb);

  -- CASO 1: 02 Octubre 2026 (Dra. Pérez - Carlos Gómez) - Cerrada + Orden + Resultado + Notificación + Adenda
  INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado)
  VALUES (v_c1, 'a0000001-0000-0000-0000-000000000001', v_med_perez, '2026-10-02 08:00:00', 20, 'CONFIRMADA');

  INSERT INTO atenciones (id, historia_id, medico_id, cita_id, fecha, motivo_consulta, estado)
  VALUES (v_at1, 'b0000001-0000-0000-0000-000000000001', v_med_perez, v_c1, '2026-10-02 08:05:00',
          'Control periódico de hipertensión arterial. Refiere cefalea ocasional.', 'ABIERTA');

  INSERT INTO signos_vitales (atencion_id, presion_sistolica, presion_diastolica, frecuencia_cardiaca,
                              frecuencia_respiratoria, temperatura_celsius, saturacion_oxigeno, peso_kg, talla_cm)
  VALUES (v_at1, 138, 88, 76, 17, 36.6, 97, 82.5, 174.0);

  INSERT INTO evoluciones_medicas (atencion_id, medico_id, fecha, subjetivo, objetivo, analisis, plan)
  VALUES (v_at1, v_med_perez, '2026-10-02 08:18:00',
    'Paciente acude a control. Manifiesta adherencia a Losartán, sin edemas ni disnea.',
    'TA: 138/88 mmHg, FC: 76 lpm. Ruidos cardiacos rítmicos sin soplos. Campos pulmonares limpios.',
    'Hipertensión arterial esencial estadio 1 con control limítrofe.',
    'Se solicita hemograma, glicemia y control de función renal. Cita en 15 días con resultados.');

  INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
  SELECT v_at1, id, 'PRINCIPAL' FROM diagnosticos_cie10 WHERE codigo = 'I10X';
  INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
  SELECT v_at1, id, 'SECUNDARIO' FROM diagnosticos_cie10 WHERE codigo = 'R51X';

  INSERT INTO procedimientos_atencion (atencion_id, cups_id, fecha)
  SELECT v_at1, id, '2026-10-02' FROM procedimientos_cups WHERE codigo = '890201';

  INSERT INTO notas_alta (atencion_id, medico_id, resumen, recomendaciones, fecha)
  VALUES (v_at1, v_med_perez,
          'Paciente estable, egresa con orden de exámenes y ajuste higiénico-dietético.',
          'Dieta hiposódica, actividad aeróbica 150 min/sem.', '2026-10-02 08:24:00');

  UPDATE atenciones SET estado = 'CERRADA' WHERE id = v_at1;

  INSERT INTO ordenes_diagnosticas (id, atencion_id, tipo, sistema_destino, fecha)
  VALUES (v_ord1, v_at1, 'LABORATORIO', 'LIS_CENTRAL', '2026-10-02 08:22:00');

  INSERT INTO detalle_orden (orden_id, cups_id, cantidad)
  SELECT v_ord1, id, 1 FROM procedimientos_cups WHERE codigo IN ('902210', '903841');

  INSERT INTO integraciones (orden_id, sistema, estado_envio, fecha_envio)
  VALUES (v_ord1, 'LIS_CENTRAL', 'ENVIADO', '2026-10-02 08:25:00');

  INSERT INTO resultados_diagnosticos (id, orden_id, tipo, informe, usuario_carga, fecha_resultado)
  VALUES (v_res1, v_ord1, 'LABORATORIO',
          'Hemograma: Leucocitos 7.200/uL, Hb 14.8 g/dL, Plaquetas 245.000/uL. Glucosa basal: 94 mg/dL. Valores normales.',
          v_enfermeros[1], '2026-10-03 14:30:00');

  INSERT INTO adendas (atencion_id, autor_id, texto, fecha)
  VALUES (v_at1, v_med_perez,
          'Se revisan resultados de laboratorio del 03/10/2026: cuadro hemático y glicemia en rangos normales. Se mantiene medicación.',
          '2026-10-05 09:10:00');
  v_adendas_count := v_adendas_count + 1;

  -- CASO 2: 05 Octubre 2026 (Dr. García - Martha Restrepo) - Cerrada
  INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado)
  VALUES (v_c2, 'a0000001-0000-0000-0000-000000000002', v_med_garcia, '2026-10-05 08:30:00', 30, 'CONFIRMADA');

  INSERT INTO atenciones (id, historia_id, medico_id, cita_id, fecha, motivo_consulta, estado)
  VALUES (v_at2, 'b0000001-0000-0000-0000-000000000002', v_med_garcia, v_c2, '2026-10-05 08:35:00',
          'Revisión trimestral de diabetes mellitus. Refiere polidipsia moderada.', 'ABIERTA');

  INSERT INTO signos_vitales (atencion_id, presion_sistolica, presion_diastolica, frecuencia_cardiaca,
                              frecuencia_respiratoria, temperatura_celsius, saturacion_oxigeno, peso_kg, talla_cm)
  VALUES (v_at2, 130, 82, 80, 18, 36.7, 98, 86.0, 160.0);

  INSERT INTO evoluciones_medicas (atencion_id, medico_id, fecha, subjetivo, objetivo, analisis, plan)
  VALUES (v_at2, v_med_garcia, '2026-10-05 08:55:00',
    'Paciente con antecedente de DM2. Dieta irregular en las últimas 3 semanas.',
    'TA: 130/82 mmHg, IMC: 33.6 (Obesidad Grado I). Sensibilidad distal conservada.',
    'Diabetes mellitus tipo 2 no insulino requiriente; sobrepeso-obesidad.',
    'Reforzar pautas nutricionales. Solicitud de perfil lipídico y HbA1c.');

  INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
  SELECT v_at2, id, 'PRINCIPAL' FROM diagnosticos_cie10 WHERE codigo = 'E119';
  INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
  SELECT v_at2, id, 'SECUNDARIO' FROM diagnosticos_cie10 WHERE codigo = 'E669';

  INSERT INTO notas_alta (atencion_id, medico_id, resumen, recomendaciones, fecha)
  VALUES (v_at2, v_med_garcia,
          'Epicrisis de control ambulatorio. Alerta sobre dieta y glucemias en ayunas.',
          'Control glucémico estricto, valoración por nutrición.', '2026-10-05 09:00:00');

  UPDATE atenciones SET estado = 'CERRADA' WHERE id = v_at2;

  -- CASO 3: 07 Octubre 2026 (Dra. Pérez - Valentina Morales) - Consentimiento + Cerrada + Radiología
  INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado)
  VALUES (v_c3, 'a0000001-0000-0000-0000-000000000003', v_med_perez, '2026-10-07 09:00:00', 20, 'CONFIRMADA');

  INSERT INTO atenciones (id, historia_id, medico_id, cita_id, fecha, motivo_consulta, estado)
  VALUES (v_at3, 'b0000001-0000-0000-0000-000000000003', v_med_perez, v_c3, '2026-10-07 09:03:00',
          'Crisis asmática leve desencadenada por cambios de clima.', 'ABIERTA');

  INSERT INTO signos_vitales (atencion_id, presion_sistolica, presion_diastolica, frecuencia_cardiaca,
                              frecuencia_respiratoria, temperatura_celsius, saturacion_oxigeno, peso_kg, talla_cm)
  VALUES (v_at3, 110, 70, 84, 22, 36.8, 96, 54.0, 162.0);

  INSERT INTO consentimientos_medicos (atencion_id, tipo, descripcion, firmado, firmado_por, fecha)
  VALUES (v_at3, 'Nebulización y terapia respiratoria',
          'Consentimiento para administración de broncodilatador inhalado', true, 'ACUDIENTE', '2026-10-07');

  INSERT INTO evoluciones_medicas (atencion_id, medico_id, fecha, subjetivo, objetivo, analisis, plan)
  VALUES (v_at3, v_med_perez, '2026-10-07 09:18:00',
    'Paciente acompañada de madre. Tos seca y sibilancias nocturnas de 2 días de evolución.',
    'Sibilancias espiratorias bilaterales leves. Sin tirajes.',
    'Exacerbación asmática leve.',
    'Ciclo corto de salbutamol con aerocámara. Pauta de esteroide inhalado.');

  INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
  SELECT v_at3, id, 'PRINCIPAL' FROM diagnosticos_cie10 WHERE codigo = 'J459';

  INSERT INTO notas_alta (atencion_id, medico_id, resumen, recomendaciones, fecha)
  VALUES (v_at3, v_med_perez,
          'Responde favorablemente a micronebulización en sala. Buena saturación final 98%.',
          'Evitar exposición al frío y alérgenos.', '2026-10-07 09:25:00');

  UPDATE atenciones SET estado = 'CERRADA' WHERE id = v_at3;

  INSERT INTO ordenes_diagnosticas (id, atencion_id, tipo, sistema_destino, fecha)
  VALUES (v_ord3, v_at3, 'RADIOLOGIA', 'RIS_IMAGENES', '2026-10-07 09:20:00');

  INSERT INTO detalle_orden (orden_id, cups_id, cantidad)
  SELECT v_ord3, id, 1 FROM procedimientos_cups WHERE codigo = '871010';

  INSERT INTO integraciones (orden_id, sistema, estado_envio, fecha_envio)
  VALUES (v_ord3, 'RIS_IMAGENES', 'ENVIADO', '2026-10-07 09:22:00');

  INSERT INTO resultados_diagnosticos (id, orden_id, tipo, informe, usuario_carga, fecha_resultado)
  VALUES (v_res3, v_ord3, 'RADIOLOGIA',
          'Rx de tórax PA: Silueta cardiaca normal. Campos pulmonares sin infiltrados activos ni consolidaciones.',
          v_enfermeros[1], '2026-10-08 11:00:00');

  -- CASO 4: 09 y 13 Octubre 2026 (Reprogramación GiST y cita_origen_id)
  INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado, motivo_cambio)
  VALUES (v_c4, 'a0000001-0000-0000-0000-000000000004', v_med_garcia, '2026-10-09 10:00:00', 30,
          'REPROGRAMADA', 'Cruce horario personal solicitado por paciente');

  INSERT INTO citas (paciente_id, medico_id, fecha, duracion_minutos, estado)
  VALUES ('a0000001-0000-0000-0000-000000000006', v_med_garcia, '2026-10-09 10:00:00', 30, 'CONFIRMADA');

  INSERT INTO citas (paciente_id, medico_id, fecha, duracion_minutos, estado, cita_origen_id)
  VALUES ('a0000001-0000-0000-0000-000000000004', v_med_garcia, '2026-10-13 10:00:00', 30, 'PROGRAMADA', v_c4);

  -- CASO 5: 12 Octubre 2026 (Cancelada y Ausentismo)
  INSERT INTO citas (paciente_id, medico_id, fecha, duracion_minutos, estado, motivo_cambio)
  VALUES ('a0000001-0000-0000-0000-000000000007', v_med_perez, '2026-10-12 08:00:00', 20,
          'CANCELADA', 'Paciente canceló con 24h de anticipación');

  INSERT INTO citas (paciente_id, medico_id, fecha, duracion_minutos, estado)
  VALUES ('a0000001-0000-0000-0000-000000000008', v_med_perez, '2026-10-12 08:30:00', 20, 'NO_ASISTIO');

  -- CASO 6: 14 Octubre 2026 (Caso Anexo C - Juan Diego Pérez García, CC 1234567890)
  INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado)
  VALUES (v_c6, 'a0000001-0000-0000-0000-000000000009', v_med_perez, '2026-10-14 09:00:00', 20, 'CONFIRMADA');

  INSERT INTO atenciones (id, historia_id, medico_id, cita_id, fecha, motivo_consulta, estado)
  VALUES (v_at6, 'b0000001-0000-0000-0000-000000000009', v_med_perez, v_c6, '2026-10-14 09:05:00',
          'Cefalea persistente de 3 días de evolución, dolor retroocular y mareo.', 'ABIERTA');

  INSERT INTO signos_vitales (atencion_id, presion_sistolica, presion_diastolica, frecuencia_cardiaca,
                              frecuencia_respiratoria, temperatura_celsius, saturacion_oxigeno, peso_kg, talla_cm)
  VALUES (v_at6, 142, 92, 82, 18, 36.9, 97, 81.5, 178.0);

  INSERT INTO evoluciones_medicas (atencion_id, medico_id, fecha, subjetivo, objetivo, analisis, plan)
  VALUES (v_at6, v_med_perez, '2026-10-14 09:18:00',
    'Paciente masculino con cefalea holocraneana de intensidad 7/10. Niega fiebre.',
    'TA: 142/92 mmHg, FC: 82 lpm, IMC: 25.7. Cuello móvil sin signos meníngeos.',
    'Hipertensión arterial estadio 1 sintomática; Cefalea en estudio.',
    'Manejo analgésico oral. Electrocardiograma en consulta y solicitud de química sanguínea.');

  INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
  SELECT v_at6, id, 'PRINCIPAL' FROM diagnosticos_cie10 WHERE codigo = 'I10X';
  INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
  SELECT v_at6, id, 'SECUNDARIO' FROM diagnosticos_cie10 WHERE codigo = 'R51X';

  INSERT INTO procedimientos_atencion (atencion_id, cups_id, fecha)
  SELECT v_at6, id, '2026-10-14' FROM procedimientos_cups WHERE codigo = '895100';

  INSERT INTO notas_alta (atencion_id, medico_id, resumen, recomendaciones, fecha)
  VALUES (v_at6, v_med_perez,
          'ECG con ritmo sinusal sin signos isquémicos agudos. Egresa con pautas de alarma.',
          'Consultar a urgencias si presenta déficit neurológico o visión borrosa.', '2026-10-14 09:22:00');

  UPDATE atenciones SET estado = 'CERRADA' WHERE id = v_at6;

  -- CASO 7: 15 Octubre 2026 (Pediatría - Dr. García) + Orden EN_PROCESO
  INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado)
  VALUES (v_c7, 'a0000001-0000-0000-0000-000000000005', v_med_garcia, '2026-10-15 11:00:00', 30, 'CONFIRMADA');

  INSERT INTO atenciones (id, historia_id, medico_id, cita_id, fecha, motivo_consulta, estado)
  VALUES (v_at7, 'b0000001-0000-0000-0000-000000000005', v_med_garcia, v_c7, '2026-10-15 11:05:00',
          'Control de crecimiento y desarrollo. Madre refiere inapetencia ocasional.', 'ABIERTA');

  INSERT INTO signos_vitales (atencion_id, presion_sistolica, presion_diastolica, frecuencia_cardiaca,
                              frecuencia_respiratoria, temperatura_celsius, saturacion_oxigeno, peso_kg, talla_cm)
  VALUES (v_at7, 95, 60, 95, 22, 36.5, 99, 21.5, 115.0);

  INSERT INTO evoluciones_medicas (atencion_id, medico_id, fecha, subjetivo, objetivo, analisis, plan)
  VALUES (v_at7, v_med_garcia, '2026-10-15 11:25:00',
    'Paciente pediátrico de 6 años traído por madre. Activo, adecuado desarrollo psicomotriz.',
    'Percentiles de peso y talla acordes para la edad.',
    'Desarrollo pondoestatural adecuado.',
    'Hemograma de rutina y desparasitación preventiva.');

  INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
  SELECT v_at7, id, 'PRINCIPAL' FROM diagnosticos_cie10 WHERE codigo = 'Z000' LIMIT 1;

  INSERT INTO notas_alta (atencion_id, medico_id, resumen, recomendaciones, fecha)
  VALUES (v_at7, v_med_garcia,
          'Menor en buen estado nutricional y motriz.',
          'Alimentación balanceada, pautas de crianza positiva.', '2026-10-15 11:30:00');

  UPDATE atenciones SET estado = 'CERRADA' WHERE id = v_at7;

  INSERT INTO ordenes_diagnosticas (id, atencion_id, tipo, sistema_destino, estado, fecha)
  VALUES (v_ord7, v_at7, 'LABORATORIO', 'LIS_CENTRAL', 'EN_PROCESO', '2026-10-15 11:28:00');

  INSERT INTO detalle_orden (orden_id, cups_id, cantidad)
  SELECT v_ord7, id, 1 FROM procedimientos_cups WHERE codigo = '902210';

  INSERT INTO integraciones (orden_id, sistema, estado_envio, fecha_envio)
  VALUES (v_ord7, 'LIS_CENTRAL', 'PENDIENTE', '2026-10-15 11:30:00');

  -- Cita complementaria del 16 Octubre 2026
  INSERT INTO citas (paciente_id, medico_id, fecha, duracion_minutos, estado)
  VALUES ('a0000001-0000-0000-0000-000000000002', v_med_perez, '2026-10-16 11:00:00', 20, 'PROGRAMADA');

  -- --------------------------------------------------------------------------
  -- 3. FLUJO MASIVO REALISTA DE IPS MEDIANA (2026-10-01 AL 2026-12-15)
  --    - Día de corte operativo: 2026-11-20
  --    - 2026-10-01 a 2026-11-19: ~300 citas con predominio de ATENDIDA + flujo
  --      clínico completo, más CANCELADA, NO_ASISTIO y REPROGRAMADA.
  --    - 2026-11-20 (HOY): citas ATENDIDA (cerradas y ~11 ABIERTA con borrador),
  --      EN_SALA con hora_llegada, CONFIRMADA y PROGRAMADA.
  --    - 2026-11-21 a 2026-12-15: ~140 citas futuras PROGRAMADA / CONFIRMADA / CANCELADA.
  -- --------------------------------------------------------------------------
  v_fecha_dia := DATE '2026-10-01';
  WHILE v_fecha_dia <= DATE '2026-12-15' LOOP
    v_dow := EXTRACT(ISODOW FROM v_fecha_dia)::integer;

    IF v_dow BETWEEN 1 AND 6 THEN
      -- Recorrer agendas activas de ese día de la semana
      FOR v_rec IN
        SELECT a.medico_id, a.hora_inicio, a.hora_fin, a.duracion_cita, u.email
          FROM agendas_medicas a
          JOIN usuarios u ON u.id = a.medico_id
         WHERE a.dia_semana = v_dow AND a.activo = true
         ORDER BY u.email
      LOOP
        v_med_id := v_rec.medico_id;
        v_dur    := v_rec.duracion_cita;
        v_h_ini  := v_rec.hora_inicio;
        v_h_fin  := v_rec.hora_fin;

        -- Determinar especialidad principal del médico para coherencia clínica
        v_esp_med := CASE v_rec.email
          WHEN 'aperez@hiscare.edu.co'    THEN 'Medicina interna'
          WHEN 'cgarcia@hiscare.edu.co'   THEN 'Medicina general'
          WHEN 'smartinez@hiscare.edu.co' THEN 'Pediatria'
          WHEN 'rgomez@hiscare.edu.co'    THEN 'Ginecologia'
          WHEN 'fcastro@hiscare.edu.co'   THEN 'Cardiologia'
          WHEN 'mospina@hiscare.edu.co'   THEN 'Medicina interna'
          WHEN 'jrestrepo@hiscare.edu.co' THEN 'Pediatria'
          ELSE 'Medicina general'
        END;

        v_max_slots := (EXTRACT(EPOCH FROM (v_h_fin - v_h_ini)) / 60)::integer / v_dur;

        -- Densidad de citas por médico y día:
        -- Asegurar citas en el primer día (2026-10-01), día de corte (2026-11-20) y último día (2026-12-15)
        IF v_fecha_dia = DATE '2026-11-20' THEN
          v_citas_dia := 4;
        ELSIF v_fecha_dia IN (DATE '2026-10-01', DATE '2026-12-15') THEN
          v_citas_dia := 2;
        ELSIF v_dow = 6 THEN
          v_citas_dia := 1;
        ELSIF v_fecha_dia < DATE '2026-11-20' THEN
          v_citas_dia := CASE WHEN random() < 0.45 THEN 2 ELSE 1 END;
        ELSE
          v_citas_dia := CASE WHEN random() < 0.35 THEN 2 ELSE 1 END;
        END IF;

        FOR v_idx IN 1..v_citas_dia LOOP
          -- Elegir una franja libre dentro de la agenda sin colisión GiST
          v_slot_offset := ((v_idx - 1) * 3 + floor(random() * 3)::integer) % v_max_slots;
          v_slot_ts := v_fecha_dia::timestamp + v_h_ini + make_interval(mins => v_slot_offset * v_dur);

          -- Si el slot está ocupado (ej. por casos demo base), buscar el siguiente libre en la agenda
          IF EXISTS (
            SELECT 1 FROM citas c
             WHERE c.medico_id = v_med_id
               AND c.estado NOT IN ('CANCELADA','REPROGRAMADA')
               AND tsrange(c.fecha, c.hora_fin) && tsrange(v_slot_ts, v_slot_ts + make_interval(mins => v_dur))
          ) THEN
            v_slot_ts := NULL;
            FOR v_slot_offset IN 0..(v_max_slots - 1) LOOP
              DECLARE v_cand timestamp := v_fecha_dia::timestamp + v_h_ini + make_interval(mins => v_slot_offset * v_dur);
              BEGIN
                IF NOT EXISTS (
                  SELECT 1 FROM citas c
                   WHERE c.medico_id = v_med_id
                     AND c.estado NOT IN ('CANCELADA','REPROGRAMADA')
                     AND tsrange(c.fecha, c.hora_fin) && tsrange(v_cand, v_cand + make_interval(mins => v_dur))
                ) THEN
                  v_slot_ts := v_cand;
                  EXIT;
                END IF;
              END;
            END LOOP;
          END IF;

          CONTINUE WHEN v_slot_ts IS NULL;

          -- Seleccionar paciente coherente con la especialidad del médico
          SELECT p.id, hc.id, p.sexo, EXTRACT(YEAR FROM age(v_fecha_dia, p.fecha_nacimiento))::integer
            INTO v_picked_pac, v_picked_hist, v_picked_sexo, v_picked_edad
            FROM pacientes p
            JOIN historias_clinicas hc ON hc.paciente_id = p.id
           WHERE (
             (v_esp_med = 'Pediatria'   AND EXTRACT(YEAR FROM age(v_fecha_dia, p.fecha_nacimiento)) <= 17)
             OR (v_esp_med = 'Ginecologia' AND p.sexo = 'F' AND EXTRACT(YEAR FROM age(v_fecha_dia, p.fecha_nacimiento)) >= 15)
             OR (v_esp_med IN ('Cardiologia','Medicina interna') AND EXTRACT(YEAR FROM age(v_fecha_dia, p.fecha_nacimiento)) >= 35)
             OR (v_esp_med = 'Medicina general')
           )
           ORDER BY random()
           LIMIT 1;

          v_cita_id := gen_random_uuid();
          v_roll := random();

          -- ==================================================================
          -- RAMA A: CITAS PASADAS (2026-10-01 a 2026-11-19)
          -- ==================================================================
          IF v_fecha_dia < DATE '2026-11-20' THEN
            IF v_fecha_dia = DATE '2026-10-01' OR v_roll < 0.80 THEN
              v_estado_cita := 'CONFIRMADA'; -- Pasará a ATENDIDA vía trigger de atenciones
            ELSIF v_roll < 0.88 THEN
              v_estado_cita := 'CANCELADA';
            ELSIF v_roll < 0.94 THEN
              v_estado_cita := 'NO_ASISTIO';
            ELSE
              v_estado_cita := 'REPROGRAMADA';
            END IF;

            INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado, motivo_cambio)
            VALUES (
              v_cita_id, v_picked_pac, v_med_id, v_slot_ts, v_dur, v_estado_cita,
              CASE v_estado_cita
                WHEN 'CANCELADA'    THEN 'Paciente canceló cita por calamidad doméstica con antelación.'
                WHEN 'REPROGRAMADA' THEN 'Solicitud de cambio de horario por compromiso laboral del paciente.'
                ELSE NULL
              END
            );
            v_total_citas := v_total_citas + 1;

            -- Si es REPROGRAMADA, crear cita destino sin cruce en día hábil posterior
            IF v_estado_cita = 'REPROGRAMADA' THEN
              v_reprog_ts := NULL;
              FOR v_slot_offset IN 1..5 LOOP
                DECLARE
                  v_target_day date := v_fecha_dia + v_slot_offset;
                  v_cand_ts timestamp;
                BEGIN
                  CONTINUE WHEN EXTRACT(ISODOW FROM v_target_day) = 7;
                  v_cand_ts := v_target_day::timestamp + v_h_ini + make_interval(mins => ((v_max_slots - 1) * v_dur));
                  IF v_target_day <= DATE '2026-12-15'
                     AND EXISTS (SELECT 1 FROM agendas_medicas am WHERE am.medico_id = v_med_id AND am.dia_semana = EXTRACT(ISODOW FROM v_target_day)::smallint)
                     AND NOT EXISTS (
                       SELECT 1 FROM citas c
                        WHERE c.medico_id = v_med_id
                          AND c.estado NOT IN ('CANCELADA','REPROGRAMADA')
                          AND tsrange(c.fecha, c.hora_fin) && tsrange(v_cand_ts, v_cand_ts + make_interval(mins => v_dur))
                     )
                  THEN
                    v_reprog_ts := v_cand_ts;
                    EXIT;
                  END IF;
                END;
              END LOOP;

              IF v_reprog_ts IS NOT NULL THEN
                v_cita_reprog_id := gen_random_uuid();
                INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado, cita_origen_id)
                VALUES (
                  v_cita_reprog_id, v_picked_pac, v_med_id, v_reprog_ts, v_dur,
                  CASE WHEN v_reprog_ts::date < DATE '2026-11-20' THEN 'CONFIRMADA' ELSE 'PROGRAMADA' END,
                  v_cita_id
                );
                v_total_citas := v_total_citas + 1;

                -- Si la cita reprogramada cayó antes de 2026-11-20, generarle su flujo clínico completo
                IF v_reprog_ts::date < DATE '2026-11-20' THEN
                  v_cita_id     := v_cita_reprog_id;
                  v_slot_ts     := v_reprog_ts;
                  v_estado_cita := 'CONFIRMADA';
                END IF;
              END IF;
            END IF;

          -- ==================================================================
          -- RAMA B: DÍA DE CORTE (2026-11-20)
          -- ==================================================================
          ELSIF v_fecha_dia = DATE '2026-11-20' THEN
            IF v_idx = 1 THEN
              -- Primer turno del día: atendida (CERRADA)
              v_estado_cita := 'EN_SALA';
              INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado, hora_llegada)
              VALUES (v_cita_id, v_picked_pac, v_med_id, v_slot_ts, v_dur, v_estado_cita, v_slot_ts - interval '10 minutes');
            ELSIF v_idx = 2 AND v_abiertas_count < 12 THEN
              -- Segundo turno del día: en curso ABIERTA con borrador SOAP
              v_estado_cita := 'EN_SALA';
              INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado, hora_llegada)
              VALUES (v_cita_id, v_picked_pac, v_med_id, v_slot_ts, v_dur, v_estado_cita, v_slot_ts - interval '8 minutes');
            ELSIF v_idx = 3 THEN
              -- Tercer turno del día: paciente en sala de espera
              v_estado_cita := 'EN_SALA';
              INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado, hora_llegada)
              VALUES (v_cita_id, v_picked_pac, v_med_id, v_slot_ts, v_dur, v_estado_cita, v_slot_ts - interval '12 minutes');
            ELSE
              v_estado_cita := CASE WHEN v_roll < 0.65 THEN 'CONFIRMADA' ELSE 'PROGRAMADA' END;
              INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado)
              VALUES (v_cita_id, v_picked_pac, v_med_id, v_slot_ts, v_dur, v_estado_cita);
            END IF;
            v_total_citas := v_total_citas + 1;

          -- ==================================================================
          -- RAMA C: CITAS FUTURAS (2026-11-21 a 2026-12-15)
          -- ==================================================================
          ELSE
            IF v_fecha_dia = DATE '2026-12-15' THEN
              v_estado_cita := CASE WHEN v_idx = 1 THEN 'CONFIRMADA' ELSE 'PROGRAMADA' END;
            ELSIF v_roll < 0.52 THEN
              v_estado_cita := 'CONFIRMADA';
            ELSIF v_roll < 0.92 THEN
              v_estado_cita := 'PROGRAMADA';
            ELSE
              v_estado_cita := 'CANCELADA';
            END IF;

            INSERT INTO citas (id, paciente_id, medico_id, fecha, duracion_minutos, estado, motivo_cambio)
            VALUES (
              v_cita_id, v_picked_pac, v_med_id, v_slot_ts, v_dur, v_estado_cita,
              CASE WHEN v_estado_cita = 'CANCELADA' THEN 'Paciente solicitó cancelación anticipada por viaje.' ELSE NULL END
            );
            v_total_citas := v_total_citas + 1;
          END IF;

          -- ==================================================================
          -- FLUJO CLÍNICO COMPLETO PARA CITAS CON ATENCIÓN
          --   - Todas las pasadas en CONFIRMADA (triggers pasan a ATENDIDA)
          --   - En 2026-11-20: idx=1 (CERRADA o ABIERTA) e idx=2 (ABIERTA con borrador)
          --   - Más 4 recientes de 2026-11-19 en ABIERTA con borrador SOAP
          -- ==================================================================
          IF (v_fecha_dia < DATE '2026-11-20' AND v_estado_cita = 'CONFIRMADA')
             OR (v_fecha_dia = DATE '2026-11-20' AND v_idx IN (1, 2))
          THEN
            v_at_id := gen_random_uuid();

            -- Seleccionar CIE-10 principal y motivo según especialidad
            IF v_esp_med = 'Pediatria' THEN
              v_cie_prin  := v_cie_ped[1 + floor(random() * array_length(v_cie_ped, 1))::integer];
              v_motivo    := v_motivos_ped[1 + floor(random() * array_length(v_motivos_ped, 1))::integer];
              v_cups_cons := v_cups_cons_esp;
            ELSIF v_esp_med = 'Ginecologia' THEN
              v_cie_prin  := v_cie_gin[1 + floor(random() * array_length(v_cie_gin, 1))::integer];
              v_motivo    := v_motivos_gin[1 + floor(random() * array_length(v_motivos_gin, 1))::integer];
              v_cups_cons := CASE WHEN random() < 0.5 THEN v_cups_cons_esp ELSE v_cups_ctrl_esp END;
            ELSIF v_esp_med = 'Cardiologia' THEN
              v_cie_prin  := v_cie_car[1 + floor(random() * array_length(v_cie_car, 1))::integer];
              v_motivo    := v_motivos_car[1 + floor(random() * array_length(v_motivos_car, 1))::integer];
              v_cups_cons := CASE WHEN random() < 0.4 THEN v_cups_cons_esp ELSE v_cups_ctrl_esp END;
            ELSIF v_esp_med = 'Medicina interna' THEN
              v_cie_prin  := v_cie_int[1 + floor(random() * array_length(v_cie_int, 1))::integer];
              v_motivo    := v_motivos_int[1 + floor(random() * array_length(v_motivos_int, 1))::integer];
              v_cups_cons := CASE WHEN random() < 0.4 THEN v_cups_cons_esp ELSE v_cups_ctrl_esp END;
            ELSE
              v_cie_prin  := v_cie_gen[1 + floor(random() * array_length(v_cie_gen, 1))::integer];
              v_motivo    := v_motivos_gen[1 + floor(random() * array_length(v_motivos_gen, 1))::integer];
              v_cups_cons := CASE WHEN random() < 0.5 THEN v_cups_cons_gen ELSE v_cups_ctrl_gen END;
            END IF;

            -- Signos vitales fisiológicamente coherentes por edad
            IF v_picked_edad < 12 THEN
              v_ps    := 88  + floor(random() * 20)::integer;
              v_pd    := 54  + floor(random() * 14)::integer;
              v_fc    := 82  + floor(random() * 28)::integer;
              v_fr    := 18  + floor(random() * 6)::integer;
              v_peso  := round((14.0 + v_picked_edad * 2.6 + random() * 4.0)::numeric, 2);
              v_talla := round((88.0 + v_picked_edad * 5.2 + random() * 5.0)::numeric, 2);
            ELSE
              v_ps    := 108 + floor(random() * 38)::integer;
              v_pd    := 66  + floor(random() * 24)::integer;
              v_fc    := 62  + floor(random() * 30)::integer;
              v_fr    := 14  + floor(random() * 6)::integer;
              v_peso  := round((52.0 + random() * 38.0)::numeric, 2);
              v_talla := round((152.0 + random() * 32.0)::numeric, 2);
            END IF;
            v_temp := round((36.1 + random() * 1.4)::numeric, 1);
            v_sat  := 94 + floor(random() * 6)::integer;

            -- 1. Iniciar atención en estado ABIERTA (trigger actualiza cita -> ATENDIDA)
            INSERT INTO atenciones (id, historia_id, medico_id, cita_id, fecha, motivo_consulta, estado)
            VALUES (v_at_id, v_picked_hist, v_med_id, v_cita_id, v_slot_ts + interval '4 minutes', v_motivo, 'ABIERTA');

            -- 2. Signos vitales
            INSERT INTO signos_vitales (atencion_id, presion_sistolica, presion_diastolica, frecuencia_cardiaca,
                                        frecuencia_respiratoria, temperatura_celsius, saturacion_oxigeno, peso_kg, talla_cm)
            VALUES (v_at_id, v_ps, v_pd, v_fc, v_fr, v_temp, v_sat, v_peso, v_talla);

            -- 3. Diagnóstico PRINCIPAL (obligatorio para cierre y también útil en ABIERTA)
            INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
            VALUES (v_at_id, v_cie_prin, 'PRINCIPAL');

            -- Decidir si queda en curso ABIERTA con borrador (~11-12 recientes) o se CIERRA completamente
            IF (
              (v_fecha_dia = DATE '2026-11-20' AND v_idx = 2)
              OR (v_fecha_dia = DATE '2026-11-19' AND v_abiertas_count < 11 AND random() < 0.65)
            ) AND v_abiertas_count < 12 THEN
              v_abiertas_count := v_abiertas_count + 1;

              INSERT INTO infra.borradores (usuario_id, atencion_id, seccion, contenido)
              VALUES (
                v_med_id,
                v_at_id,
                v_secciones[1 + (v_abiertas_count % 2)],
                jsonb_build_object(
                  'subjetivo', 'Paciente en valoración clínica actual. ' || v_motivo,
                  'objetivo',  format('TA %s/%s mmHg, FC %s lpm, SatO2 %s%%, Temp %s °C. Examen físico en curso.',
                                      v_ps, v_pd, v_fc, v_sat, v_temp)
                )
              );
            ELSE
              -- Diagnóstico SECUNDARIO en ~55% de las atenciones cerradas (cuidando no duplicar el principal)
              IF random() < 0.55 THEN
                v_cie_sec_id := v_cie_sec[1 + floor(random() * array_length(v_cie_sec, 1))::integer];
                IF v_cie_sec_id IS DISTINCT FROM v_cie_prin THEN
                  INSERT INTO diagnosticos_atencion (atencion_id, cie10_id, tipo)
                  VALUES (v_at_id, v_cie_sec_id, 'SECUNDARIO')
                  ON CONFLICT (atencion_id, cie10_id) DO NOTHING;
                END IF;
              END IF;

              -- 4. Evolución médica SOAP completa
              v_subjetivo := 'Acude a consulta de ' || lower(v_esp_med) || '. ' || v_motivo || ' Niega signos de alarma inmediatos.';
              v_objetivo  := format('Paciente alerta, orientado, hidratado. TA %s/%s mmHg, FC %s lpm, FR %s rpm, Temp %s °C, SatO2 %s%%. Examen físico cardiopulmonar y abdominal sin hallazgos agudos de descompensación.',
                                    v_ps, v_pd, v_fc, v_fr, v_temp, v_sat);
              v_analisis  := 'Cuadro clínico concordante con impresión diagnóstica principal en seguimiento ambulatorio dentro de ' || v_esp_med || '.';
              v_plan      := 'Se formula manejo farmacológico y medidas no farmacológicas; se entregan pautas de alarma y control ambulatorio.';

              INSERT INTO evoluciones_medicas (atencion_id, medico_id, fecha, descripcion, subjetivo, objetivo, analisis, plan)
              VALUES (
                v_at_id, v_med_id, v_slot_ts + interval '15 minutes',
                'S: ' || v_subjetivo || ' | O: ' || v_objetivo || ' | A: ' || v_analisis || ' | P: ' || v_plan,
                v_subjetivo, v_objetivo, v_analisis, v_plan
              );

              -- 5. Procedimientos de la atención (consulta + ocasional procedimiento diagnóstico o invasivo)
              INSERT INTO procedimientos_atencion (atencion_id, cups_id, fecha)
              VALUES (v_at_id, v_cups_cons, v_fecha_dia);

              IF random() < 0.14 THEN
                -- Procedimiento que requiere consentimiento informado obligatorio
                v_cups_proc := v_cups_proc_cons[1 + floor(random() * array_length(v_cups_proc_cons, 1))::integer];
                SELECT descripcion INTO v_proc_desc FROM procedimientos_cups WHERE id = v_cups_proc;

                INSERT INTO procedimientos_atencion (atencion_id, cups_id, fecha)
                VALUES (v_at_id, v_cups_proc, v_fecha_dia);

                INSERT INTO consentimientos_medicos (atencion_id, tipo, descripcion, firmado, firmado_por, fecha)
                VALUES (
                  v_at_id,
                  left(v_proc_desc, 140),
                  'Consentimiento informado explicado sobre riesgos, beneficios y alternativas de ' || v_proc_desc,
                  true,
                  CASE WHEN v_picked_edad < 18 THEN 'ACUDIENTE' ELSE 'PACIENTE' END,
                  v_fecha_dia
                );
              ELSIF random() < 0.25 THEN
                -- Procedimiento diagnóstico no invasivo (ECG, Espirometría, Holter, MAPA)
                v_cups_proc := v_cups_proc_no[1 + floor(random() * array_length(v_cups_proc_no, 1))::integer];
                INSERT INTO procedimientos_atencion (atencion_id, cups_id, fecha)
                VALUES (v_at_id, v_cups_proc, v_fecha_dia);
              END IF;

              -- 6. Nota de alta / Epicrisis
              INSERT INTO notas_alta (atencion_id, medico_id, resumen, recomendaciones, fecha)
              VALUES (
                v_at_id, v_med_id,
                'Atención ambulatoria completada sin complicaciones en ' || v_esp_med || '. Paciente hemodinámicamente estable al egreso.',
                'Continuar esquema terapéutico formulado, adherencia a hábitos saludables y acudir a urgencias ante signos de alarma.',
                v_slot_ts + interval '19 minutes'
              );

              -- 7. Cierre real de atención -> dispara trg_atenciones_cierre (SHA-256)
              UPDATE atenciones SET estado = 'CERRADA' WHERE id = v_at_id;

              -- 8. Órdenes diagnósticas (~48% de las atenciones cerradas)
              IF random() < 0.48 THEN
                v_orden_id := gen_random_uuid();
                IF random() < 0.72 THEN
                  v_tipo_ord  := 'LABORATORIO';
                  v_sist_dest := 'LIS_CENTRAL';
                ELSE
                  v_tipo_ord  := 'RADIOLOGIA';
                  v_sist_dest := 'RIS_IMAGENES';
                END IF;

                -- Órdenes anteriores a 2026-11-17 mayoritariamente COMPLETADA; recientes en EN_PROCESO o PENDIENTE
                IF v_fecha_dia <= DATE '2026-11-16' AND random() < 0.90 THEN
                  v_ord_estado := 'PENDIENTE'; -- Se marcará COMPLETADA al insertar resultado vía trigger
                ELSIF random() < 0.60 THEN
                  v_ord_estado := 'EN_PROCESO';
                ELSE
                  v_ord_estado := 'PENDIENTE';
                END IF;

                INSERT INTO ordenes_diagnosticas (id, atencion_id, tipo, estado, sistema_destino, fecha)
                VALUES (v_orden_id, v_at_id, v_tipo_ord, v_ord_estado, v_sist_dest, v_slot_ts + interval '18 minutes');

                IF v_tipo_ord = 'LABORATORIO' THEN
                  INSERT INTO detalle_orden (orden_id, cups_id, cantidad)
                  VALUES (v_orden_id, v_cups_lab[1 + floor(random() * array_length(v_cups_lab, 1))::integer], 1);
                  IF random() < 0.45 THEN
                    INSERT INTO detalle_orden (orden_id, cups_id, cantidad)
                    VALUES (v_orden_id, v_cups_lab[1 + floor(random() * array_length(v_cups_lab, 1))::integer], 1);
                  END IF;
                ELSE
                  INSERT INTO detalle_orden (orden_id, cups_id, cantidad)
                  VALUES (v_orden_id, v_cups_rad[1 + floor(random() * array_length(v_cups_rad, 1))::integer], 1);
                END IF;

                IF v_fecha_dia <= DATE '2026-11-16' AND v_ord_estado = 'PENDIENTE' AND random() < 0.92 THEN
                  INSERT INTO integraciones (orden_id, sistema, estado_envio, fecha_envio, intentos, respuesta)
                  VALUES (v_orden_id, v_sist_dest, 'ENVIADO', v_slot_ts + interval '22 minutes', 1, 'ACK 200 OK - Orden recibida por ' || v_sist_dest);

                  v_res_id := gen_random_uuid();
                  v_enf_id := v_enfermeros[1 + floor(random() * array_length(v_enfermeros, 1))::integer];

                  -- Insertar resultado dispara trg_resultado_notifica -> orden COMPLETADA + notificación
                  INSERT INTO resultados_diagnosticos (id, orden_id, tipo, informe, usuario_carga, fecha_resultado)
                  VALUES (
                    v_res_id,
                    v_orden_id,
                    v_tipo_ord,
                    CASE v_tipo_ord
                      WHEN 'LABORATORIO' THEN 'Procesamiento automatizado en ' || v_sist_dest || ': parámetros hematológicos y química sanguínea dentro de límites de referencia clínica.'
                      ELSE 'Lectura radiológica en ' || v_sist_dest || ': estructuras anatómicas conservadas, sin evidencia de lesiones agudas ni colecciones.'
                    END,
                    v_enf_id,
                    v_slot_ts + interval '1 day' + interval '3 hours'
                  );
                ELSE
                  INSERT INTO integraciones (orden_id, sistema, estado_envio, fecha_envio, intentos, respuesta)
                  VALUES (
                    v_orden_id,
                    v_sist_dest,
                    CASE WHEN v_ord_estado = 'EN_PROCESO' THEN 'ENVIADO' ELSE 'PENDIENTE' END,
                    CASE WHEN v_ord_estado = 'EN_PROCESO' THEN v_slot_ts + interval '25 minutes' ELSE NULL END,
                    CASE WHEN v_ord_estado = 'EN_PROCESO' THEN 1 ELSE 0 END,
                    CASE WHEN v_ord_estado = 'EN_PROCESO' THEN 'En procesamiento técnico' ELSE 'En cola de despacho' END
                  );
                END IF;
              END IF;

              -- 9. Adendas clínicas post-cierre (~28 adendas distribuidas en atenciones cerradas)
              IF v_fecha_dia <= DATE '2026-11-17' AND v_adendas_count < 28 AND random() < 0.14 THEN
                INSERT INTO adendas (atencion_id, autor_id, texto, fecha)
                VALUES (
                  v_at_id,
                  v_med_id,
                  'Nota aclaratoria post-cierre: se verifica reporte paraclínico y se confirma continuidad del plan terapéutico ambulatorio sin novedades.',
                  v_slot_ts + interval '2 days'
                );
                v_adendas_count := v_adendas_count + 1;
              END IF;
            END IF;
          END IF;
        END LOOP;
      END LOOP;
    END IF;

    v_fecha_dia := v_fecha_dia + 1;
  END LOOP;

  -- Sincronizar fechas y marcar como leídas ~60% de las notificaciones de octubre/inicio noviembre
  UPDATE notificaciones n
     SET fecha = r.fecha_resultado,
         leido = (r.fecha_resultado < TIMESTAMP '2026-11-08 00:00:00')
    FROM resultados_diagnosticos r
   WHERE n.resultado_id = r.id;

  RAISE NOTICE 'Seed IPS Mediana completada: % citas generadas, % atenciones ABIERTA, % adendas.',
    v_total_citas, v_abiertas_count, v_adendas_count;
END $seed$;

COMMIT;
