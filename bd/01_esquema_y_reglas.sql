-- ============================================================================
-- HISCARE — SCRIPT 01: ESQUEMA FÍSICO, VIGENCIA Y REGLAS DE NEGOCIO
-- Archivo: bd/01_esquema_y_reglas.sql
-- Motor: PostgreSQL 15+  |  Codificación: UTF-8
-- Versión: 2.1.0 (Consolidación definitiva)
--
-- DESCRIPCIÓN:
-- Script maestro transaccional e idempotente que construye la infraestructura
-- relacional completa de HISCARE (consolidando 00_hiscare_completo_unificado,
-- 01_esquema, 02_reglas y 06_fase1_vigencia_catalogos_y_legado):
--   1. Extensiones requeridas (pgcrypto, btree_gist, pg_trgm).
--   2. Esquemas de base de datos (public, infra).
--   3. Limpieza previa idempotente en orden topológico inverso (DROP CASCADE).
--   4. Secuencias operacionales (seq_orden_codigo).
--   5. 28 tablas de dominio clínico/operacional + 3 tablas técnicas en infra
--      (incluye columnas y restricciones de vigencia en CIE-10 y CUPS, así como
--      la documentación formal de la tabla de legado infra.tokens_recuperacion).
--   6. Índices B-Tree, GIN trigram, GiST de exclusión y únicos condicionales
--      (incluyendo uq_notificaciones_resultado, idx_cie10_vigente_codigo y
--      idx_cups_vigente_codigo).
--   7. Funciones PL/pgSQL y Triggers de integridad, RBAC (MEDICO y ADMINISTRADOR),
--      cierre clínico inmutable con firma SHA-256, adendas, notificaciones y
--      bitácora de auditoría inviolable.
--   8. Rol de aplicación hiscare_app con privilegios mínimos (POLP).
--
-- NOTA DE EJECUCIÓN:
--   Ejecutar como superusuario (postgres) sobre la base de datos destino.
--   Marcas heredadas: [E] = Anexo E, [AJ] = ajuste Tabla C.29 / Fase 1.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONES REQUERIDAS DE POSTGRESQL
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid(), crypt(), gen_salt()
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- Restricción GiST no_cruce_citas con '='
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- Búsqueda predictiva trigram CIE-10, CUPS y pacientes

-- ----------------------------------------------------------------------------
-- 1. TRANSACCIÓN SEGURA, ESQUEMAS Y CONTEXTO DE SESIÓN
-- ----------------------------------------------------------------------------
BEGIN;

CREATE SCHEMA IF NOT EXISTS infra;          -- Tablas técnicas fuera de las 28 de dominio (HIS-NF-05)
CREATE SCHEMA IF NOT EXISTS public;

-- Desactivar contexto de usuario temporal para tareas de definición estructural
SELECT set_config('hiscare.usuario_id', '', false);
SELECT set_config('hiscare.ip_origen', '', false);

-- ----------------------------------------------------------------------------
-- 2. LIMPIEZA PREVIA IDEMPOTENTE (Orden topológico inverso: Hojas -> Raíces)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS infra.tokens_recuperacion CASCADE; -- Tabla sin uso / legado (conservada en DDL por compatibilidad)
DROP TABLE IF EXISTS infra.borradores CASCADE;
DROP TABLE IF EXISTS infra.session CASCADE;

DROP TABLE IF EXISTS public.notificaciones CASCADE;
DROP TABLE IF EXISTS public.auditoria CASCADE;
DROP TABLE IF EXISTS public.adendas CASCADE;
DROP TABLE IF EXISTS public.notas_alta CASCADE;
DROP TABLE IF EXISTS public.resultados_diagnosticos CASCADE;
DROP TABLE IF EXISTS public.integraciones CASCADE;
DROP TABLE IF EXISTS public.detalle_orden CASCADE;
DROP TABLE IF EXISTS public.ordenes_diagnosticas CASCADE;
DROP TABLE IF EXISTS public.procedimientos_atencion CASCADE;
DROP TABLE IF EXISTS public.procedimientos_cups CASCADE;
DROP TABLE IF EXISTS public.diagnosticos_atencion CASCADE;
DROP TABLE IF EXISTS public.diagnosticos_cie10 CASCADE;
DROP TABLE IF EXISTS public.evoluciones_medicas CASCADE;
DROP TABLE IF EXISTS public.consentimientos_medicos CASCADE;
DROP TABLE IF EXISTS public.signos_vitales CASCADE;
DROP TABLE IF EXISTS public.atenciones CASCADE;
DROP TABLE IF EXISTS public.antecedentes CASCADE;
DROP TABLE IF EXISTS public.historias_clinicas CASCADE;
DROP TABLE IF EXISTS public.citas CASCADE;
DROP TABLE IF EXISTS public.agendas_medicas CASCADE;
DROP TABLE IF EXISTS public.contactos_emergencia CASCADE;
DROP TABLE IF EXISTS public.paciente_aseguradora CASCADE;
DROP TABLE IF EXISTS public.pacientes CASCADE;
DROP TABLE IF EXISTS public.aseguradoras CASCADE;
DROP TABLE IF EXISTS public.usuario_especialidad CASCADE;
DROP TABLE IF EXISTS public.especialidades CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;

DROP SEQUENCE IF EXISTS public.seq_orden_codigo CASCADE;

-- ----------------------------------------------------------------------------
-- 3. SECUENCIAS
-- ----------------------------------------------------------------------------
CREATE SEQUENCE seq_orden_codigo START 89001;

-- ----------------------------------------------------------------------------
-- 4. TABLAS DE DOMINIO CLÍNICO Y OPERACIONAL (Orden Topológico Estricto)
-- ----------------------------------------------------------------------------

-- 1. roles [E]
CREATE TABLE roles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             varchar(50) NOT NULL UNIQUE
                     CHECK (nombre IN ('ADMINISTRADOR','MEDICO','RECEPCIONISTA','ENFERMERO','AUDITOR')),
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 2. usuarios [E] + [AJ] debe_cambiar_clave
CREATE TABLE usuarios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             varchar(150) NOT NULL,
  email              varchar(150) NOT NULL UNIQUE,
  password_hash      varchar(255) NOT NULL,
  rol_id             uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  activo             boolean NOT NULL DEFAULT true,
  debe_cambiar_clave boolean NOT NULL DEFAULT true,          -- [AJ] contraseña temporal (C.12)
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 3. especialidades [E]
CREATE TABLE especialidades (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             varchar(100) NOT NULL UNIQUE,
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 4. usuario_especialidad [E]
CREATE TABLE usuario_especialidad (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id         uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  especialidad_id    uuid NOT NULL REFERENCES especialidades(id) ON DELETE RESTRICT,
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_usuario_especialidad UNIQUE (usuario_id, especialidad_id)
);

-- 5. aseguradoras [E] + [AJ] activo
CREATE TABLE aseguradoras (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             varchar(150) NOT NULL UNIQUE,
  tipo_plan          varchar(20) CHECK (tipo_plan IN ('Contributivo','Subsidiado','Especial','Particular')),
  activo             boolean NOT NULL DEFAULT true,          -- [AJ] columna Estado VIGENTE de C.14
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 6. pacientes [E]
CREATE TABLE pacientes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento     varchar(5) NOT NULL
                     CHECK (tipo_documento IN ('CC','TI','CE','RC','PA','PT','PE','CN','AS','MS','CD')),
  numero_documento   varchar(20) NOT NULL UNIQUE,
  -- [AJ opcional Tabla C.29] reemplazar el UNIQUE anterior por:
  -- CONSTRAINT uq_paciente_documento UNIQUE (tipo_documento, numero_documento)
  nombres            varchar(100) NOT NULL,
  apellidos          varchar(100) NOT NULL,
  fecha_nacimiento   date CHECK (fecha_nacimiento <= CURRENT_DATE),
  sexo               varchar(15) CHECK (sexo IN ('M','F','Indeterminado')),
  telefono           varchar(20),
  direccion          varchar(200),
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 7. paciente_aseguradora [E]
CREATE TABLE paciente_aseguradora (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id        uuid NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  aseguradora_id     uuid NOT NULL REFERENCES aseguradoras(id) ON DELETE RESTRICT,
  tipo_usuario       varchar(20) CHECK (tipo_usuario IN ('Cotizante','Beneficiario','Particular')),
  numero_contrato    varchar(50),
  fecha_inicio       date,
  fecha_fin          date,
  activo             boolean NOT NULL DEFAULT true,
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ck_pa_vigencia CHECK (fecha_fin >= fecha_inicio)
);

-- 8. contactos_emergencia [E]
CREATE TABLE contactos_emergencia (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id        uuid NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  nombre             varchar(150) NOT NULL,
  telefono           varchar(20),
  parentesco         varchar(50),
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 9. agendas_medicas [AJ] (EDT-CIT-01)
CREATE TABLE agendas_medicas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id          uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  dia_semana         smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),   -- ISO: 1 = lunes, ..., 7 = domingo
  hora_inicio        time NOT NULL,
  hora_fin           time NOT NULL,
  duracion_cita      integer NOT NULL DEFAULT 30 CHECK (duracion_cita > 0),
  activo             boolean NOT NULL DEFAULT true,
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ck_agenda_horas CHECK (hora_fin > hora_inicio)
);

-- 10. citas [E] + [AJ] estados CONFIRMADA, EN_SALA, REPROGRAMADA; cita_origen_id; motivo_cambio; hora_llegada
CREATE TABLE citas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id        uuid NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  medico_id          uuid NOT NULL REFERENCES usuarios(id),
  fecha              timestamp NOT NULL,
  duracion_minutos   integer NOT NULL DEFAULT 30 CHECK (duracion_minutos > 0),
  hora_fin           timestamp GENERATED ALWAYS AS (fecha + duracion_minutos * interval '1 minute') STORED,
  estado             varchar(15) NOT NULL DEFAULT 'PROGRAMADA'
                     CHECK (estado IN ('PROGRAMADA','CONFIRMADA','EN_SALA','ATENDIDA',
                                       'CANCELADA','NO_ASISTIO','REPROGRAMADA')),
  cita_origen_id     uuid REFERENCES citas(id),              -- [AJ] HIS-F-10 (C.17)
  motivo_cambio      varchar(200),                           -- [AJ] motivo de cancelación/reprogramación
  hora_llegada       timestamp,                              -- [AJ] sala de espera (C.18)
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now(),
  CONSTRAINT no_cruce_citas EXCLUDE USING gist (
    medico_id WITH =,
    tsrange(fecha, hora_fin) WITH &&
  ) WHERE (estado NOT IN ('CANCELADA','REPROGRAMADA'))
);

-- 11. historias_clinicas [E]
CREATE TABLE historias_clinicas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id        uuid NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE RESTRICT,
  fecha_apertura     date NOT NULL DEFAULT CURRENT_DATE,
  activo             boolean NOT NULL DEFAULT true,
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 12. atenciones [E]
CREATE TABLE atenciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  historia_id        uuid NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
  medico_id          uuid NOT NULL REFERENCES usuarios(id),
  cita_id            uuid UNIQUE REFERENCES citas(id),
  fecha              timestamp NOT NULL DEFAULT now(),
  motivo_consulta    text,
  estado             varchar(10) NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','CERRADA')),
  fecha_cierre       timestamp,
  firma_hash         varchar(64),
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ck_atencion_firma CHECK (estado <> 'CERRADA' OR (firma_hash IS NOT NULL AND fecha_cierre IS NOT NULL))
);

-- 13. signos_vitales [E]
CREATE TABLE signos_vitales (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id             uuid NOT NULL REFERENCES atenciones(id) ON DELETE RESTRICT,
  presion_sistolica       integer CHECK (presion_sistolica BETWEEN 40 AND 300),
  presion_diastolica      integer CHECK (presion_diastolica BETWEEN 20 AND 200),
  frecuencia_cardiaca     integer CHECK (frecuencia_cardiaca BETWEEN 20 AND 300),
  frecuencia_respiratoria integer CHECK (frecuencia_respiratoria BETWEEN 4 AND 80),
  temperatura_celsius     decimal(4,1) CHECK (temperatura_celsius BETWEEN 30 AND 45),
  saturacion_oxigeno      integer CHECK (saturacion_oxigeno BETWEEN 0 AND 100),
  peso_kg                 decimal(5,2) CHECK (peso_kg BETWEEN 0.3 AND 500),
  talla_cm                decimal(5,2) CHECK (talla_cm BETWEEN 20 AND 260),
  imc                     decimal(4,1) GENERATED ALWAYS AS
                          (round(peso_kg / ((talla_cm / 100.0) * (talla_cm / 100.0)), 1)) STORED,
  fecha_creacion          timestamp NOT NULL DEFAULT now(),
  fecha_modificacion      timestamp NOT NULL DEFAULT now()
);

-- 14. antecedentes [E]
CREATE TABLE antecedentes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  historia_id        uuid NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
  tipo               varchar(20) CHECK (tipo IN ('Patologico','Quirurgico','Alergico','Farmacologico',
                                                 'Familiar','Ginecologico')),
  descripcion        text,
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 15. consentimientos_medicos [E] + [AJ] firmado_por
CREATE TABLE consentimientos_medicos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id        uuid NOT NULL REFERENCES atenciones(id) ON DELETE RESTRICT,
  tipo               varchar(150),
  descripcion        text,
  fecha              date NOT NULL DEFAULT CURRENT_DATE,
  firmado            boolean NOT NULL DEFAULT false,
  firmado_por        varchar(10) CHECK (firmado_por IN ('PACIENTE','ACUDIENTE')),   -- [AJ] C.19
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 16. evoluciones_medicas [E] + [AJ] secciones SOAP
CREATE TABLE evoluciones_medicas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id        uuid NOT NULL REFERENCES atenciones(id) ON DELETE RESTRICT,
  medico_id          uuid NOT NULL REFERENCES usuarios(id),
  fecha              timestamp NOT NULL DEFAULT now(),
  descripcion        text,                 -- [E] nota completa (texto plano S/O/A/P)
  subjetivo          text,                 -- [AJ] C.6
  objetivo           text,
  analisis           text,
  plan               text,
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 17. diagnosticos_cie10 [E] + [AJ Fase 1] columnas y restricción de vigencia
CREATE TABLE diagnosticos_cie10 (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo             varchar(10) NOT NULL UNIQUE,
  descripcion        varchar(255) NOT NULL,
  activo             boolean NOT NULL DEFAULT true,
  vigente_desde      date NOT NULL DEFAULT DATE '2020-01-01',
  vigente_hasta      date NULL,
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_cie10_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

-- 18. diagnosticos_atencion [E]
CREATE TABLE diagnosticos_atencion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id        uuid NOT NULL REFERENCES atenciones(id) ON DELETE RESTRICT,
  cie10_id           uuid NOT NULL REFERENCES diagnosticos_cie10(id) ON DELETE RESTRICT,
  tipo               varchar(12) NOT NULL DEFAULT 'SECUNDARIO' CHECK (tipo IN ('PRINCIPAL','SECUNDARIO')),
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_diag_atencion UNIQUE (atencion_id, cie10_id)
);

-- 19. procedimientos_cups [E] + [AJ] requiere_consentimiento + [AJ Fase 1] vigencia
CREATE TABLE procedimientos_cups (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                  varchar(10) NOT NULL UNIQUE,
  descripcion             varchar(255) NOT NULL,
  requiere_consentimiento boolean NOT NULL DEFAULT false,     -- [AJ] regla [19.35]
  activo                  boolean NOT NULL DEFAULT true,
  vigente_desde           date NOT NULL DEFAULT DATE '2020-01-01',
  vigente_hasta           date NULL,
  fecha_creacion          timestamp NOT NULL DEFAULT now(),
  fecha_modificacion      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_cups_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

-- 20. procedimientos_atencion [E]
CREATE TABLE procedimientos_atencion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id        uuid NOT NULL REFERENCES atenciones(id) ON DELETE RESTRICT,
  cups_id            uuid NOT NULL REFERENCES procedimientos_cups(id) ON DELETE RESTRICT,
  fecha              date DEFAULT CURRENT_DATE,
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 21. notas_alta [E] + [AJ] medico_id (HIS-D-03)
CREATE TABLE notas_alta (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id        uuid NOT NULL UNIQUE REFERENCES atenciones(id) ON DELETE RESTRICT,
  medico_id          uuid REFERENCES usuarios(id),           -- [AJ] autor de la epicrisis
  resumen            text,
  recomendaciones    text,
  fecha              timestamp NOT NULL DEFAULT now(),
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 22. ordenes_diagnosticas [E] + [AJ] código legible (ORD-89001)
CREATE TABLE ordenes_diagnosticas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo             varchar(15) NOT NULL UNIQUE DEFAULT ('ORD-' || nextval('seq_orden_codigo')),
  atencion_id        uuid NOT NULL REFERENCES atenciones(id) ON DELETE RESTRICT,
  tipo               varchar(12) NOT NULL CHECK (tipo IN ('LABORATORIO','RADIOLOGIA')),
  estado             varchar(12) NOT NULL DEFAULT 'PENDIENTE'
                     CHECK (estado IN ('PENDIENTE','EN_PROCESO','COMPLETADA','CANCELADA')),
  sistema_destino    varchar(50),
  fecha              timestamp NOT NULL DEFAULT now(),
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 23. detalle_orden [E]
CREATE TABLE detalle_orden (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id           uuid NOT NULL REFERENCES ordenes_diagnosticas(id) ON DELETE CASCADE,
  cups_id            uuid NOT NULL REFERENCES procedimientos_cups(id) ON DELETE RESTRICT,
  cantidad           integer NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 24. integraciones [E] + [AJ] id_despacho, intentos, proximo_intento
CREATE TABLE integraciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id           uuid NOT NULL REFERENCES ordenes_diagnosticas(id) ON DELETE RESTRICT,
  sistema            varchar(50),
  estado_envio       varchar(10) NOT NULL DEFAULT 'PENDIENTE'
                     CHECK (estado_envio IN ('ENVIADO','PENDIENTE','REINTENTO','ERROR')),
  fecha_envio        timestamp,
  respuesta          text,
  id_despacho        uuid NOT NULL DEFAULT gen_random_uuid(),  -- [AJ] idempotencia HIS-E-03
  intentos           integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),  -- [AJ] C.23
  proximo_intento    timestamp DEFAULT now(),                   -- [AJ] política 1, 5, 15 min
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 25. resultados_diagnosticos [E]
CREATE TABLE resultados_diagnosticos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id           uuid NOT NULL REFERENCES ordenes_diagnosticas(id) ON DELETE RESTRICT,
  tipo               varchar(12) NOT NULL CHECK (tipo IN ('LABORATORIO','RADIOLOGIA')),
  informe            text,
  archivo_url        text,
  fecha_resultado    timestamp NOT NULL DEFAULT now(),
  usuario_carga      uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- 26. adendas [AJ] (HIS-D-02, HIS-E-07, EDT-RNF-05) - solo inserción
CREATE TABLE adendas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id        uuid NOT NULL REFERENCES atenciones(id) ON DELETE RESTRICT,
  autor_id           uuid NOT NULL REFERENCES usuarios(id),
  texto              text NOT NULL CHECK (length(trim(texto)) > 0),
  fecha              timestamp NOT NULL DEFAULT now()
);

-- 27. auditoria [E] + [AJ] registro_id y acciones de seguridad (solo inserción; sin fecha_modificacion)
CREATE TABLE auditoria (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id         uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ip_origen          inet,
  tabla_afectada     varchar(60) NOT NULL,
  registro_id        uuid,                                   -- [AJ] búsqueda por código de registro (C.26)
  accion             varchar(20) NOT NULL
                     CHECK (accion IN ('INSERT','UPDATE','DELETE','SELECT_CONFIDENTIAL',
                                       'LOGIN','LOGIN_FALLIDO','LOGOUT','ACCESO_DENEGADO')),
  fecha              timestamp NOT NULL DEFAULT now(),
  detalle            text
);

-- 28. notificaciones [E] + [AJ] prioridad (CA-06)
CREATE TABLE notificaciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id         uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  resultado_id       uuid REFERENCES resultados_diagnosticos(id) ON DELETE SET NULL,
  mensaje            text NOT NULL,
  leido              boolean NOT NULL DEFAULT false,
  prioridad          varchar(8) NOT NULL DEFAULT 'NORMAL' CHECK (prioridad IN ('NORMAL','CRITICA')),
  fecha              timestamp NOT NULL DEFAULT now(),
  fecha_creacion     timestamp NOT NULL DEFAULT now(),
  fecha_modificacion timestamp NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. TABLAS DEL ESQUEMA TÉCNICO INFRA (Fuera del dominio clínico)
-- ----------------------------------------------------------------------------

-- Sesiones de express-session (connect-pg-simple)
CREATE TABLE infra.session (
  sid    varchar NOT NULL PRIMARY KEY,
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL
);

-- Borradores clínicos no confirmados (HIS-E-06, HIS-NF-06)
CREATE TABLE infra.borradores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  atencion_id  uuid NOT NULL REFERENCES atenciones(id) ON DELETE CASCADE,
  seccion      varchar(20) NOT NULL CHECK (seccion IN ('motivo','soap','alta','orden')),
  contenido    jsonb NOT NULL,
  fecha        timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_borrador UNIQUE (usuario_id, atencion_id, seccion)
);

-- Tokens de recuperación de contraseña (C.1 [1.10])
-- [SIN USO / LEGADO]: Conservada por compatibilidad histórica. El restablecimiento
-- de contraseña se realiza exclusivamente mediante ticket ante Sistemas / Mesa de
-- Ayuda y restablecimiento administrativo (debe_cambiar_clave = true).
CREATE TABLE infra.tokens_recuperacion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  varchar(64) NOT NULL UNIQUE,     -- sha256 del token enviado por correo
  expira      timestamp NOT NULL,
  usado       boolean NOT NULL DEFAULT false
);
COMMENT ON TABLE infra.tokens_recuperacion IS
  'Tabla sin uso (legado): conservada por compatibilidad histórica; la recuperación de acceso se gestiona por ticket ante Sistemas.';

-- ----------------------------------------------------------------------------
-- 6. ÍNDICES DE RENDIMIENTO (B-Tree, GIN Trigram, GiST y Condicionales)
-- ----------------------------------------------------------------------------

-- Pacientes y contactos
CREATE INDEX ix_pacientes_nombre_trgm ON pacientes USING gin ((nombres || ' ' || apellidos) gin_trgm_ops);
CREATE INDEX ix_contactos_paciente ON contactos_emergencia (paciente_id);
CREATE INDEX ix_pa_paciente ON paciente_aseguradora (paciente_id);

-- Citas y Agendas
CREATE INDEX ix_agendas_medico ON agendas_medicas (medico_id, dia_semana);
CREATE INDEX ix_citas_medico_fecha ON citas (medico_id, fecha);
CREATE INDEX ix_citas_paciente ON citas (paciente_id);

-- Atenciones clínicas y registros derivados
CREATE INDEX ix_atenciones_historia ON atenciones (historia_id, fecha DESC);
CREATE INDEX ix_atenciones_medico ON atenciones (medico_id, fecha DESC);
CREATE INDEX ix_signos_atencion ON signos_vitales (atencion_id, fecha_creacion DESC);
CREATE INDEX ix_antecedentes_historia ON antecedentes (historia_id, tipo);
CREATE INDEX ix_consentimientos_atencion ON consentimientos_medicos (atencion_id);
CREATE INDEX ix_evoluciones_atencion ON evoluciones_medicas (atencion_id, fecha);

-- Catálogos y Búsqueda Predictiva Trigram (< 500 ms) + Índices de Códigos Vigentes (Fase 1)
CREATE INDEX ix_cie10_desc_trgm ON diagnosticos_cie10 USING gin (descripcion gin_trgm_ops);
CREATE INDEX ix_cups_desc_trgm ON procedimientos_cups USING gin (descripcion gin_trgm_ops);
CREATE INDEX idx_cie10_vigente_codigo ON diagnosticos_cie10 (codigo) WHERE activo = true;
CREATE INDEX idx_cups_vigente_codigo ON procedimientos_cups (codigo) WHERE activo = true;

-- Diagnósticos y Procedimientos de Atención
CREATE UNIQUE INDEX ux_diag_principal ON diagnosticos_atencion (atencion_id) WHERE tipo = 'PRINCIPAL';
CREATE INDEX ix_proc_atencion ON procedimientos_atencion (atencion_id);

-- Órdenes Diagnósticas, Integraciones y Resultados
CREATE INDEX ix_ordenes_atencion ON ordenes_diagnosticas (atencion_id);
CREATE INDEX ix_ordenes_fecha_estado ON ordenes_diagnosticas (fecha DESC, estado);
CREATE INDEX ix_detalle_orden ON detalle_orden (orden_id);
CREATE INDEX ix_integraciones_cola ON integraciones (estado_envio, proximo_intento);
CREATE INDEX ix_integraciones_orden ON integraciones (orden_id);
CREATE INDEX ix_resultados_orden ON resultados_diagnosticos (orden_id);

-- Adendas y Notificaciones
CREATE INDEX ix_adendas_atencion ON adendas (atencion_id, fecha);
CREATE INDEX ix_notif_usuario_leido ON notificaciones (usuario_id, leido, fecha DESC);
CREATE UNIQUE INDEX uq_notificaciones_resultado ON notificaciones (resultado_id) WHERE resultado_id IS NOT NULL;

-- Auditoría
CREATE INDEX ix_auditoria_fecha ON auditoria (fecha DESC);
CREATE INDEX ix_auditoria_usuario ON auditoria (usuario_id, fecha DESC);
CREATE INDEX ix_auditoria_tabla ON auditoria (tabla_afectada, fecha DESC);
CREATE INDEX ix_auditoria_registro ON auditoria (registro_id);

-- Infraestructura
CREATE INDEX ix_session_expire ON infra.session (expire);

-- ----------------------------------------------------------------------------
-- 7. FUNCIONES PL/PGSQL Y DISPARADORES (Reglas de Negocio e Integridad)
-- ----------------------------------------------------------------------------

-- Regla 7.1: Actualización automática de fecha_modificacion en cada UPDATE
CREATE OR REPLACE FUNCTION fn_set_fecha_modificacion() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.fecha_modificacion := now();
  RETURN NEW;
END $fn$;

DO $fn$
DECLARE t record;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'fecha_modificacion'
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_fmod BEFORE UPDATE ON %1$I
                    FOR EACH ROW EXECUTE FUNCTION fn_set_fecha_modificacion()', t.table_name);
  END LOOP;
END $fn$;

-- Regla 7.2: FIX RBAC — El médico asignado debe ser un usuario activo con rol 'MEDICO' o 'ADMINISTRADOR'
CREATE OR REPLACE FUNCTION fn_validar_medico() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.id = NEW.medico_id
      AND u.activo = true
      AND r.nombre IN ('MEDICO', 'ADMINISTRADOR')
  ) THEN
    RAISE EXCEPTION 'El profesional asignado no es un usuario activo con rol MEDICO o ADMINISTRADOR'
      USING ERRCODE = 'P0001', HINT = 'RBAC';
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_citas_medico BEFORE INSERT OR UPDATE OF medico_id ON citas
  FOR EACH ROW EXECUTE FUNCTION fn_validar_medico();

CREATE TRIGGER trg_atenciones_medico BEFORE INSERT OR UPDATE OF medico_id ON atenciones
  FOR EACH ROW EXECUTE FUNCTION fn_validar_medico();

CREATE TRIGGER trg_evoluciones_medicas_medico BEFORE INSERT OR UPDATE OF medico_id ON evoluciones_medicas
  FOR EACH ROW EXECUTE FUNCTION fn_validar_medico();

-- Regla 7.3: Validación de Cita al iniciar atención y cambio a estado ATENDIDA
CREATE OR REPLACE FUNCTION fn_atenciones_cita_validar() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_pac_cita uuid;
  v_estado varchar;
  v_pac_hist uuid;
BEGIN
  IF NEW.cita_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT paciente_id, estado INTO v_pac_cita, v_estado FROM citas WHERE id = NEW.cita_id;
  SELECT paciente_id INTO v_pac_hist FROM historias_clinicas WHERE id = NEW.historia_id;

  IF v_pac_cita IS DISTINCT FROM v_pac_hist THEN
    RAISE EXCEPTION 'La cita no pertenece al paciente de la historia clinica' USING ERRCODE = 'P0001';
  END IF;

  IF v_estado IN ('CANCELADA','NO_ASISTIO','REPROGRAMADA','ATENDIDA') THEN
    RAISE EXCEPTION 'No se puede iniciar una atencion desde una cita en estado %', v_estado USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION fn_atenciones_cita_marcar() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.cita_id IS NOT NULL THEN
    UPDATE citas SET estado = 'ATENDIDA' WHERE id = NEW.cita_id;
  END IF;
  RETURN NULL;
END $fn$;

CREATE TRIGGER trg_atenciones_cita BEFORE INSERT OR UPDATE OF cita_id ON atenciones
  FOR EACH ROW EXECUTE FUNCTION fn_atenciones_cita_validar();

CREATE TRIGGER trg_atenciones_cita_marcar AFTER INSERT ON atenciones
  FOR EACH ROW EXECUTE FUNCTION fn_atenciones_cita_marcar();

-- Regla 7.4: Huella Digital Criptográfica SHA-256 de la atención clínica y verificación
CREATE OR REPLACE FUNCTION fn_hash_atencion(p_atencion jsonb) RETURNS varchar
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_id uuid := (p_atencion->>'id')::uuid;
  v_doc jsonb;
BEGIN
  v_doc := jsonb_build_object(
    'atencion',        p_atencion - 'firma_hash' - 'fecha_modificacion',
    'signos',          (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'fecha_modificacion' ORDER BY x.id), '[]') FROM signos_vitales x WHERE x.atencion_id = v_id),
    'consentimientos', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'fecha_modificacion' ORDER BY x.id), '[]') FROM consentimientos_medicos x WHERE x.atencion_id = v_id),
    'evoluciones',     (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'fecha_modificacion' ORDER BY x.id), '[]') FROM evoluciones_medicas x WHERE x.atencion_id = v_id),
    'diagnosticos',    (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'fecha_modificacion' ORDER BY x.id), '[]') FROM diagnosticos_atencion x WHERE x.atencion_id = v_id),
    'procedimientos',  (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'fecha_modificacion' ORDER BY x.id), '[]') FROM procedimientos_atencion x WHERE x.atencion_id = v_id),
    'nota_alta',       (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'fecha_modificacion' ORDER BY x.id), '[]') FROM notas_alta x WHERE x.atencion_id = v_id)
  );
  RETURN encode(sha256(convert_to(v_doc::text, 'UTF8')), 'hex');
END $fn$;

CREATE OR REPLACE FUNCTION fn_verificar_firma(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT a.firma_hash = fn_hash_atencion(to_jsonb(a)) FROM atenciones a WHERE a.id = p_id;
$fn$;

-- Regla 7.5: Cierre de Atención Clínica — Exige Diagnóstico PRINCIPAL, estampa firma SHA-256 e inmutabiliza
CREATE OR REPLACE FUNCTION fn_atenciones_cierre() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado = 'CERRADA' THEN
      RAISE EXCEPTION 'HIS-E-07: la atencion esta cerrada y no se puede eliminar' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.estado = 'CERRADA' THEN
    RAISE EXCEPTION 'HIS-E-07: la atencion esta cerrada; solo se permiten adendas' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.estado = 'CERRADA' THEN
    IF NOT EXISTS (SELECT 1 FROM diagnosticos_atencion WHERE atencion_id = NEW.id AND tipo = 'PRINCIPAL') THEN
      RAISE EXCEPTION 'No se puede cerrar la atencion sin un diagnostico PRINCIPAL' USING ERRCODE = 'P0001';
    END IF;
    NEW.fecha_cierre := now();
    NEW.firma_hash   := fn_hash_atencion(to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_atenciones_cierre BEFORE UPDATE OR DELETE ON atenciones
  FOR EACH ROW EXECUTE FUNCTION fn_atenciones_cierre();

-- Regla 7.6: Bloqueo estricto de inserción/edición/eliminación de registros en atenciones cerradas
CREATE OR REPLACE FUNCTION fn_bloqueo_atencion_cerrada() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ids := ARRAY[NEW.atencion_id];
  ELSIF TG_OP = 'UPDATE' THEN
    v_ids := ARRAY[OLD.atencion_id, NEW.atencion_id];
  ELSE
    v_ids := ARRAY[OLD.atencion_id];
  END IF;

  IF EXISTS (SELECT 1 FROM atenciones WHERE id = ANY(v_ids) AND estado = 'CERRADA') THEN
    RAISE EXCEPTION 'HIS-E-07: la atencion esta cerrada; registre una adenda' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $fn$;

DO $fn$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['signos_vitales','consentimientos_medicos','evoluciones_medicas',
                           'diagnosticos_atencion','procedimientos_atencion','notas_alta']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_bloqueo BEFORE INSERT OR UPDATE OR DELETE ON %1$I
                    FOR EACH ROW EXECUTE FUNCTION fn_bloqueo_atencion_cerrada()', t);
  END LOOP;
END $fn$;

-- Regla 7.7: Adendas Clínicas — Solo aplican sobre atenciones CERRADAS y nunca se editan ni eliminan
CREATE OR REPLACE FUNCTION fn_adendas_reglas() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Las adendas no se modifican ni se eliminan' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM atenciones WHERE id = NEW.atencion_id AND estado = 'CERRADA') THEN
    RAISE EXCEPTION 'Las adendas solo aplican a atenciones cerradas' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_adendas_reglas BEFORE INSERT OR UPDATE OR DELETE ON adendas
  FOR EACH ROW EXECUTE FUNCTION fn_adendas_reglas();

-- Regla 7.8: Resultados Diagnósticos — Validación de tipo y completitud de orden con notificación (HIS-E-08, HIS-E-09)
CREATE OR REPLACE FUNCTION fn_resultado_tipo() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_tipo varchar;
  v_estado varchar;
BEGIN
  SELECT tipo, estado INTO v_tipo, v_estado FROM ordenes_diagnosticas WHERE id = NEW.orden_id;
  IF v_estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'HIS-E-08: la orden esta cancelada' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.tipo IS DISTINCT FROM v_tipo THEN
    RAISE EXCEPTION 'El tipo del resultado (%) no coincide con el de la orden (%)', NEW.tipo, v_tipo USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_resultado_tipo BEFORE INSERT OR UPDATE OF tipo, orden_id ON resultados_diagnosticos
  FOR EACH ROW EXECUTE FUNCTION fn_resultado_tipo();

CREATE OR REPLACE FUNCTION fn_resultado_notifica() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_medico uuid;
  v_codigo varchar;
BEGIN
  UPDATE ordenes_diagnosticas SET estado = 'COMPLETADA' WHERE id = NEW.orden_id
  RETURNING codigo INTO v_codigo;

  SELECT a.medico_id INTO v_medico
  FROM ordenes_diagnosticas o
  JOIN atenciones a ON a.id = o.atencion_id
  WHERE o.id = NEW.orden_id;

  BEGIN
    INSERT INTO notificaciones (usuario_id, resultado_id, mensaje)
    VALUES (v_medico, NEW.id, 'Resultado de ' || lower(NEW.tipo) || ' disponible - orden ' || v_codigo);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'HIS-E-09: no se pudo crear la notificacion del resultado %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $fn$;

CREATE TRIGGER trg_resultado_notifica AFTER INSERT ON resultados_diagnosticos
  FOR EACH ROW EXECUTE FUNCTION fn_resultado_notifica();

-- Regla 7.9: Auditoría Transaccional Automática y Contexto de Sesión (HIS-E-10)
-- El backend fija en cada transacción:
--   SELECT set_config('hiscare.usuario_id', $1, true), set_config('hiscare.ip_origen', $2, true);
CREATE OR REPLACE FUNCTION fn_ctx_usuario() RETURNS uuid
LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('hiscare.usuario_id', true), '')::uuid
$fn$;

CREATE OR REPLACE FUNCTION fn_ctx_ip() RETURNS inet
LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('hiscare.ip_origen', true), '')::inet
$fn$;

CREATE OR REPLACE FUNCTION fn_auditoria() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_antes jsonb;
  v_despues jsonb;
  v_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_antes := to_jsonb(OLD) - 'password_hash';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_despues := to_jsonb(NEW) - 'password_hash';
  END IF;
  v_id := coalesce((v_despues->>'id')::uuid, (v_antes->>'id')::uuid);

  INSERT INTO auditoria (usuario_id, ip_origen, tabla_afectada, registro_id, accion, detalle)
  VALUES (
    fn_ctx_usuario(),
    fn_ctx_ip(),
    TG_TABLE_NAME,
    v_id,
    TG_OP,
    jsonb_build_object('antes', v_antes, 'despues', v_despues)::text
  );
  RETURN NULL;
END $fn$;

DO $fn$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuarios','usuario_especialidad','pacientes','contactos_emergencia',
                           'paciente_aseguradora','citas','historias_clinicas','atenciones',
                           'signos_vitales','antecedentes','consentimientos_medicos','evoluciones_medicas',
                           'diagnosticos_atencion','procedimientos_atencion','notas_alta',
                           'ordenes_diagnosticas','detalle_orden','resultados_diagnosticos','adendas']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_auditoria AFTER INSERT OR UPDATE OR DELETE ON %1$I
                    FOR EACH ROW EXECUTE FUNCTION fn_auditoria()', t);
  END LOOP;
END $fn$;

-- fn_auditar_consulta(): llamada desde backend al abrir datos confidenciales (SELECT_CONFIDENTIAL)
CREATE OR REPLACE FUNCTION fn_auditar_consulta(p_tabla text, p_registro uuid, p_detalle text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $fn$
  INSERT INTO auditoria (usuario_id, ip_origen, tabla_afectada, registro_id, accion, detalle)
  VALUES (fn_ctx_usuario(), fn_ctx_ip(), p_tabla, p_registro, 'SELECT_CONFIDENTIAL', p_detalle);
$fn$;

-- fn_auditar_evento(): LOGIN, LOGIN_FALLIDO, LOGOUT, ACCESO_DENEGADO
CREATE OR REPLACE FUNCTION fn_auditar_evento(p_accion text, p_tabla text, p_registro uuid, p_detalle text)
RETURNS void LANGUAGE sql AS $fn$
  INSERT INTO auditoria (usuario_id, ip_origen, tabla_afectada, registro_id, accion, detalle)
  VALUES (fn_ctx_usuario(), fn_ctx_ip(), p_tabla, p_registro, p_accion, p_detalle);
$fn$;

-- Regla 7.10: Inmutabilidad Absoluta de la Bitácora de Auditoría
CREATE OR REPLACE FUNCTION fn_auditoria_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'La bitacora de auditoria es inmutable' USING ERRCODE = 'P0001';
END $fn$;

CREATE TRIGGER trg_auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_inmutable();

CREATE TRIGGER trg_auditoria_no_truncate BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION fn_auditoria_inmutable();

-- ----------------------------------------------------------------------------
-- 8. ROL DE LA APLICACIÓN Y PERMISOS DE PERSISTENCIA (POLP)
-- (Node.js se conecta con hiscare_app, nunca con postgres)
-- ----------------------------------------------------------------------------
DO $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hiscare_app') THEN
    CREATE ROLE hiscare_app LOGIN PASSWORD 'cambiar_en_produccion';
  END IF;
END $fn$;

GRANT USAGE ON SCHEMA public, infra TO hiscare_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hiscare_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA infra  TO hiscare_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hiscare_app;
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM hiscare_app;   -- Bitácora inviolable
REVOKE UPDATE, DELETE, TRUNCATE ON adendas   FROM hiscare_app;   -- Adendas solo inserción

-- ----------------------------------------------------------------------------
-- 9. CONFIRMACIÓN TRANSACCIONAL
-- ----------------------------------------------------------------------------
COMMIT;
