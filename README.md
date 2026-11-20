# HISCARE — Sistema de Información Hospitalaria e Historia Clínica Electrónica

[![Node.js Version](https://img.shields.io/badge/Node.js-22%20LTS-brightgreen.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Express Framework](https://img.shields.io/badge/Express-5.x-informational.svg?style=flat-square&logo=express)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/PostgreSQL-14%2B%20%2F%2015%20%2B%20pg__trgm-336791.svg?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![UI & Styles](https://img.shields.io/badge/Bootstrap-5.3-7952b3.svg?style=flat-square&logo=bootstrap)](https://getbootstrap.com/)
[![Security](https://img.shields.io/badge/Security-RBAC%20%7C%20SHA--256%20Immutable-red.svg?style=flat-square)](https://csrc.nist.gov/publications/detail/fips/180-4/final)
[![Compliance](https://img.shields.io/badge/Normativa-Res.%201995%2F1999%20%7C%202275%2F2023-orange.svg?style=flat-square)](https://www.minsalud.gov.co/)
[![Tests](https://img.shields.io/badge/Tests-node%3Atest%20%7C%2038%20Suites-success.svg?style=flat-square)](https://nodejs.org/api/test.html)

**HISCARE** es una solución integral de **Sistema de Información Hospitalaria (HIS)** e **Historia Clínica Electrónica (HCE)** de alto rendimiento, diseñada para Instituciones Prestadoras de Servicios de Salud (IPS) de modalidad ambulatoria y hospitalaria en la República de Colombia.

El sistema unifica la gestión administrativa, la admisión de pacientes, el agendamiento inteligente sin cruces horarios, la atención clínica estructurada bajo metodología SOAP, la codificación diagnóstica oficial CIE-10 y de procedimientos CUPS, la prescripción y trazabilidad de órdenes diagnósticas (Laboratorio e Imágenes), la gestión bioética de consentimientos informados, y el cierre inmutable de atenciones asistenciales con firma y sellado criptográfico digital **SHA-256**.

---

## 📑 Tabla de Contenidos

1. [Visión General y Propósito del Sistema](#1-visión-general-y-propósito-del-sistema)
2. [Arquitectura Tecnológica y Stack](#2-arquitectura-tecnológica-y-stack)
3. [Diagramas de Arquitectura y Flujo Asistencial](#3-diagramas-de-arquitectura-y-flujo-asistencial)
4. [Catálogo Integral de Módulos (C.01 a C.27)](#4-catálogo-integral-de-módulos-c01-a-c27)
   - [Módulo I: Autenticación y Control de Excepciones](#área-i-autenticación-y-control-de-excepciones-c01-c27)
   - [Módulo II: Dashboard de la Jornada Asistencial](#área-ii-dashboard-de-la-jornada-asistencial-c02)
   - [Módulo III: Gestión Demográfica y Ficha Clínica Única](#área-iii-gestión-demográfica-y-ficha-clínica-única-c03-c15)
   - [Módulo IV: Agenda Médica, Admisiones y Citas](#área-iv-agenda-médica-admisiones-y-citas-c16-c17-c18)
   - [Módulo V: Atención Clínica Ambulatoria y Hospitalaria](#área-v-atención-clínica-ambulatoria-y-hospitalaria-c04-c05-c06-c07-c08-c09-c10-c19-c20-c21-c22)
   - [Módulo VI: Centro de Notificaciones y Alertas Clínicas](#área-vi-centro-de-notificaciones-y-alertas-clínicas-c11)
   - [Módulo VII: Administración y Configuración Hospitalaria](#área-vii-administración-y-configuración-hospitalaria-c12-c13-c14)
   - [Módulo VIII: Apoyo Diagnóstico LIS / RIS](#área-viii-apoyo-diagnóstico-lis--ris-c23-c24-c25)
   - [Módulo IX: Bitácora Forense y Trazabilidad Transaccional](#área-ix-bitácora-forense-y-trazabilidad-transaccional-c26)
5. [Estructura del Repositorio y Directorios](#5-estructura-del-repositorio-y-directorios)
6. [Requisitos de Entorno e Instalación](#6-requisitos-de-entorno-e-instalación)
7. [Comandos de Operación y Scripts npm](#7-comandos-de-operación-y-scripts-npm)
8. [Suite de Pruebas Automatizadas](#8-suite-de-pruebas-automatizadas)
9. [Directorio Institucional y Credenciales de Prueba](#9-directorio-institucional-y-credenciales-de-prueba)
10. [Marco Normativo y Cumplimiento Legal](#10-marco-normativo-y-cumplimiento-legal)

---

## 1. Visión General y Propósito del Sistema

HISCARE surge para resolver las brechas de fragmentación de datos, pérdida de trazabilidad asistencial y riesgos médico-legales en instituciones prestadoras de salud. Su diseño se cimenta en cinco pilares operacionales:

1. **Integridad y Seguridad del Paciente**: Registro longitudinal unificado donde antecedentes, alergias críticas y signos vitales alertan de forma proactiva al equipo asistencial en cada punto de contacto.
2. **Inmutabilidad Clínica Forense**: Una vez cerrada la atención médica, el registro queda criptográficamente sellado mediante una función hash **SHA-256** calculada sobre el contenido clínico canónico. Triggers a nivel de base de datos (`PL/pgSQL`) abortan cualquier intento de actualización (`UPDATE`) o eliminación (`DELETE`), permitiendo adiciones documentales únicamente a través del mecanismo legal de **adendas médicas**.
3. **Alto Rendimiento y Predictibilidad**: Búsqueda difusa y fonética sobre millones de registros demográficos y códigos de catálogos mediante trigramas PostgreSQL (`pg_trgm`) en tiempos inferiores a **500 ms** (con latencias operacionales típicas de 10 a 25 ms).
4. **Seguridad y Control de Acceso Granular (RBAC)**: Autorización estricta por roles (`ADMINISTRADOR`, `MEDICO`, `ENFERMERO`, `RECEPCIONISTA`, `AUDITOR`) bajo el Principio de Menor Privilegio (PoLP), registrando usuario de aplicación e IP origen en cada transacción mediante variables de sesión PostgreSQL (`set_config`).
5. **Alineación Normativa Nacional**: Cumplimiento exhaustivo de la normatividad sanitaria del Ministerio de Salud y Protección Social de Colombia (Resoluciones 1995/1999 y 2275/2023, estándares CIE-10, CUPS y RIPS).

---

## 2. Arquitectura Tecnológica y Stack

HISCARE adopta un patrón **Monolito Modular Robusto** con renderizado del lado del servidor (SSR), maximizando la confiabilidad, reduciendo la superficie de ataque y delegando las restricciones duras de integridad relacional al motor PostgreSQL.

```
+-----------------------------------------------------------------------------------+
|                              CAPA DE PRESENTACIÓN (CLIENTE)                       |
|  Bootstrap 5.3 (CSS Accesible) | Vanilla JS ES6+ (Debounce, AbortController)     |
|  Iconografía SVG | Indicadores de Estado Clínico | Badges WCAG AA Conformes       |
+-----------------------------------------------------------------------------------+
                                          ▲
                                          │ HTTP / HTTPS (SSR + AJAX JSON)
                                          ▼
+-----------------------------------------------------------------------------------+
|                                CAPA DE APLICACIÓN (NODE.JS)                       |
|  Node.js 22 LTS | Express 5.x | EJS Template Engine SSR                       |
|  Helmet (Cabeceras HTTP Seguras) | Express-Session (connect-pg-simple)           |
|  Bcrypt.js (Costo 12) | Express-Validator (Sanitización) | Rate Limiters          |
|  Controladores Modulares | Servicios de Dominio | Middlewares de Autorización     |
+-----------------------------------------------------------------------------------+
                                          ▲
                                          │ Conexión Nativa Resiliente (pg Pool)
                                          ▼
+-----------------------------------------------------------------------------------+
|                           CAPA DE PERSISTENCIA Y REGLAS (POSTGRESQL)              |
|  PostgreSQL 14+ / 15 | Transacciones ACID tx(ctx, fn) con Session Variables      |
|  Extensiones: pg_trgm (Búsqueda GIN), btree_gist (Exclusión de Cruces Horarios)   |
|  Triggers PL/pgSQL: Auditoría Forense, Bloqueo de Cierre, Sellado SHA-256        |
|  Índices Parciales Únicos (Un solo Diagnóstico Principal por Atención)          |
+-----------------------------------------------------------------------------------+
```

### Componentes Tecnológicos

- **Backend**:
  - `Node.js` (22 LTS certificado; `engines: >=22.0.0 <23.0.0`, `.nvmrc: 22`): Entorno de ejecución oficial estandarizado para estabilidad y rendimiento en producción.
  - `Express 5.2.1`: Framework web de última generación con manejo robusto de promesas y asincronía.
  - `EJS 7.0.1`: Motor de plantillas Server-Side Rendering con layouts y componentes reusables (`partials`).
  - `pg 8.23.1`: Cliente nativo PostgreSQL con pooling de conexiones y ejecución transaccional segura.
  - `connect-pg-simple 10.0.0`: Persistencia de sesiones en base de datos para ambientes escalables y tolerantes a fallos.
  - `helmet 8.3.0` & `express-rate-limit 8.7.1`: Mitigación de ataques de fuerza bruta y endurecimiento de cabeceras de red.
  - `express-validator 7.3.2`: Capa de validación declarativa de datos de entrada.
  - `bcryptjs 3.0.3`: Cifrado adaptativo de contraseñas con factor de coste de trabajo (`salt rounds = 12`).
  - `multer 2.4.0`: Ingesta controlada y validación de tipos MIME para paraclínicos LIS/RIS.
  - `node-cron 4.6.0`: Tareas programadas de auditoría, control de citas vencidas y despacho de órdenes.

- **Base de Datos Relacional**:
  - `PostgreSQL 14+ / 15`: Motor de base de datos relacional de grado empresarial.
  - `pg_trgm`: Índices GIN sobre expresiones trigram para búsquedas de texto predictivas (<500 ms).
  - `btree_gist`: Restricciones de exclusión temporal (`EXCLUDE USING gist`) para erradicar matemáticamente solapamientos de turnos médicos y citas.
  - `PL/pgSQL Functions & Triggers`: Encapsulación de lógica de integridad de datos crítica (reglas de atención médica, sellado digital, auditoría automática de mutaciones).

- **Frontend y Diseño de Interfaz**:
  - `Bootstrap 5.3.8`: Sistema de rejilla y utilidades tipográficas adaptativas.
  - `Vanilla JavaScript`: Arquitectura desacoplada sin sobrecarga de frameworks, con debouncing nativo, cancelación de peticiones con `AbortController` y eventos del DOM.
  - `Trazabilidad UI`: Atributos `data-trace="C<pantalla>-<componente>"` en cada elemento interactivo, permitiendo correspondencia 1:1 con la especificación funcional.
  - `UX, Accesibilidad y Dinamismo`: Panel de accesos rápidos RBAC en Inicio, protección contra pérdida de cambios sin guardar, lenguaje natural en UI (`En sala de espera`, `No asistió`), actualización dinámica de tablas vía DataTables sin recarga y sistema global `aria-live` (`HIS.anunciarCambio`).

---

## 3. Diagramas de Arquitectura y Flujo Asistencial

### 3.1 Flujo Asistencial Ambulatorio Completo (End-to-End)

El ciclo de atención de un paciente en HISCARE sigue una secuencia rigurosa e integrada entre los diferentes roles del equipo de salud:

```mermaid
flowchart TD
    subgraph INGRESO ["1. Admisión y Agendamiento"]
        C01["C.1 / C.2: Login & Dashboard"] --> C15["C.15: Búsqueda de Paciente"]
        C15 -->|No existe| C03["C.3: Registro de Paciente"]
        C15 -->|Existe| C16["C.16: Agendamiento de Cita"]
        C03 --> C16
        C16 --> C18["C.18: Recepción en Sala de Espera"]
    end

    subgraph ATENCION ["2. Atención Médica Estructurada"]
        C18 -->|Llamar Paciente| C04["C.4: Consulta y Signos Vitales"]
        C04 --> C05["C.5: Antecedentes Clínicos"]
        C05 --> C06["C.6: Evolución SOAP"]
        C06 --> C20["C.20: Diagnósticos CIE-10 & Procedimientos CUPS"]
    end

    subgraph APOYO_ORDENES ["3. Prescripción y Paraclínicos"]
        C20 --> C07["C.7: Órdenes Diagnósticas CUPS"]
        C07 --> C08["C.8: Formato de Impresión con Código de Barras"]
        C07 -->|¿Requiere Consentimiento?| C19["C.19: Consentimiento Informado"]
        C19 --> C23["C.23: Despacho a Sistemas LIS/RIS"]
        C23 --> C24["C.24: Carga de Resultados"]
        C24 --> C25["C.25: Consulta de Paraclínicos en Expediente"]
    end

    subgraph CIERRE ["4. Alta y Cierre Inmutable"]
        C20 --> C21["C.21: Nota de Alta (Epicrisis)"]
        C21 --> C22["C.22: Cierre Clínico & Sellado SHA-256"]
        C22 -->|Expediente Inmutable| C09["C.9: Historia Clínica Longitudinal"]
        C22 -.->|Post-Cierre| C22_A["Adenda Médica Auditada"]
    end

    subgraph AUDITORIA_SISTEMA ["5. Gobierno y Seguridad"]
        C22 --> C26["C.26: Bitácora de Auditoría Forense"]
        C24 --> C11["C.11: Alertas Clínicas y Pánico"]
    end
```

### 3.2 Diagrama de Estados de la Cita Médica

```mermaid
stateDiagram-v2
    [*] --> PROGRAMADA: Creación en C.16
    PROGRAMADA --> CONFIRMADA: Confirmación de Asistencia
    CONFIRMADA --> EN_SALA: Check-in Recepción en C.18
    PROGRAMADA --> EN_SALA: Llegada directa
    PROGRAMADA --> CANCELADA: Cancelación justificada en C.17
    CONFIRMADA --> CANCELADA: Cancelación en C.17
    PROGRAMADA --> REPROGRAMADA: Reprogramación en C.17
    CONFIRMADA --> REPROGRAMADA: Reprogramación en C.17
    EN_SALA --> EN_ATENCION: Médico inicia atención (C.18 -> C.4)
    EN_ATENCION --> ATENDIDA: Cierre exitoso de la atención en C.22
    PROGRAMADA --> NO_ASISTIO: Ausencia confirmada
    CONFIRMADA --> NO_ASISTIO: Ausencia confirmada
    ATENDIDA --> [*]
    CANCELADA --> [*]
    NO_ASISTIO --> [*]
```

---

## 4. Catálogo Integral de Módulos (C.01 a C.27)

El sistema se compone de 27 módulos y pantallas funcionales estandarizadas bajo las especificaciones de ingeniería asistencial:

### Área I: Autenticación y Control de Excepciones (C.01, C.27)

#### `C.01` — Inicio de Sesión y Control de Acceso por Rol
- **Ruta Principal**: `GET /auth/login` | `POST /auth/login` | `POST /auth/logout`
- **Actores**: Todo el personal institucional (Público no autenticado).
- **Descripción**: Punto de acceso único al sistema. Evalúa credenciales institucionales contra la base de datos utilizando `bcrypt` (costo 12). Carga dinámicamente el rol del usuario (`ADMINISTRADOR`, `MEDICO`, `ENFERMERO`, `RECEPCIONISTA`, `AUDITOR`) y redirige automáticamente a la vista principal correspondiente a su perfil sin solicitar selector de rol.
- **Seguridad**: Rate limiting de protección contra fuerza bruta (máximo 5 intentos fallidos por ventana de 15 minutos). Registro inmediato en bitácora de auditoría de accesos exitosos y fallidos con captura de IP.
- **Gestión de Recuperación de Acceso y Tabla de Legado**:
  > [!NOTE]
  > **Flujo Oficial de Restablecimiento**: Por directriz de seguridad hospitalaria y trazabilidad forense, la recuperación de acceso no se realiza por autoservicio de correo electrónico (`SMTP_*`). Se gestiona exclusivamente mediante **ticket presencial o formal ante el Departamento de Sistemas / Mesa de Ayuda**. El administrador ejecuta el restablecimiento forzando el atributo `debe_cambiar_clave = true` para exigir el cambio inmediato de contraseña en el siguiente inicio de sesión.
  >
  > **Tabla `infra.tokens_recuperacion` (Sin uso / Legado)**: Dicha tabla se conserva en el esquema relacional únicamente por compatibilidad histórica documental (`COMMENT ON TABLE infra.tokens_recuperacion IS 'Tabla sin uso (legado): conservada por compatibilidad histórica; la recuperación de acceso se gestiona por ticket ante Sistemas.'`). No cuenta con enrutadores ni endpoints activos en la capa de aplicación.
- **Normativa / Req**: `HIS-F-01`, `HIS-F-02`, `HIS-NF-04`, `HIS-NF-06`, `SEG-01` a `SEG-06`.

#### `C.27` — Pantallas de Control de Errores y Excepciones Asistenciales
- **Rutas Principales**: Vistas automáticas interceptadas por middlewares de manejo de errores HTTP (`403`, `404`, `500`, `503`).
- **Actores**: Todos los usuarios.
- **Descripción**: Páginas de respuesta visualmente integradas al diseño institucional:
  - `403 Prohibido`: Se activa cuando un usuario intenta acceder a un recurso sin los permisos RBAC suficientes; incluye botón directo de retorno a su panel.
  - `Sesión Expirada`: Manejo elegante de la pérdida de sesión con modal informativo y redirección al login preservando el estado de la aplicación.
  - `503 Falla de Conexión / Mantenimiento`: Pantalla informativa en caso de indisponibilidad temporal de la base de datos.
- **Regla Crítica**: **Zero Stack Traces**. Nunca se exponen al usuario trazas de error de Node.js, sentencias SQL ni esquemas internos (`HIS-E-12`).

---

### Área II: Dashboard de la Jornada Asistencial (C.02)

#### `C.02` — Dashboard General de la Jornada
- **Ruta Principal**: `GET /inicio`
- **Actores**: Todo usuario autenticado (contenido renderizado según rol activo).
- **Descripción**: Panel de mando centralizado de la jornada de trabajo. Presenta un layout maestro consistente:
  - **Barra Superior (`_topbar`)**: Identidad de la IPS, datos del usuario activo, badge de rol con color identificativo y campana de notificaciones con contador en vivo.
  - **Menú Lateral (`_sidebar`)**: Navegación jerárquica contextualizada según los módulos permitidos para el rol en la matriz RBAC.
  - **Tarjetas de Métricas en Vivo**: Resumen de citas del día (programadas, en sala, atendidas), órdenes diagnósticas pendientes de resultado, pacientes en espera y alertas de resultados de laboratorio con valores críticos.

---

### Área III: Gestión Demográfica y Ficha Clínica Única (C.03, C.15)

#### `C.03` — Registro de Paciente Nuevo con Afiliación y Contactos
- **Ruta Principal**: `GET /pacientes/nuevo` | `POST /pacientes/nuevo`
- **Actores**: `RECEPCIONISTA`, `ADMINISTRADOR`.
- **Descripción**: Formulario de captura y validación integral para la apertura de nuevas fichas de pacientes:
  - **Identificación**: Validación estricta de documentos colombianos (`CC`, `TI`, `RC`, `CE`, `PA`, `AS`, `MS`). Validación matemática de unicidad del documento.
  - **Datos Demográficos**: Nombres, apellidos, fecha de nacimiento, sexo biológico, grupo sanguíneo y factor Rh.
  - **Afiliación y Cobertura**: Selección de entidad aseguradora (EPS) del catálogo activo, régimen de afiliación (`Contributivo`, `Subsidiado`, `Particular`, `Especial`) y estado de vigencia.
  - **Contacto y Residencia**: Dirección residencial, municipio, teléfono y datos completos del contacto de emergencia / acudiente responsable.

#### `C.15` — Búsqueda de Pacientes y Ficha Única
- **Ruta Principal**: `GET /pacientes` | `GET /pacientes/:id` | `GET /api/pacientes/buscar`
- **Actores**: `RECEPCIONISTA`, `MEDICO`, `ENFERMERO`, `AUDITOR`, `ADMINISTRADOR`.
- **Descripción**: Motor de localización ultrarrápido con autocompletado en tiempo real:
  - Búsqueda dual: por coincidencia exacta o prefijo de número de documento, o búsqueda difusa por nombres y apellidos utilizando el operador trigrama `%` de PostgreSQL.
  - Tiempos de respuesta certificados inferiores a 500 ms sobre catálogos de cientos de miles de registros.
  - **Ficha Única del Paciente**: Resumen consolidado del estado del paciente, alertas médicas (alergias activas), aseguradora asignada, antecedentes y botones de acción rápida para agendar cita o consultar la historia longitudinal.

---

### Área IV: Agenda Médica, Admisiones y Citas (C.16, C.17, C.18)

#### `C.16` — Agendamiento de Citas y Control de Cruces Horarios
- **Ruta Principal**: `GET /citas/nueva` | `POST /api/citas`
- **Actores**: `RECEPCIONISTA`, `MEDICO`, `ADMINISTRADOR`.
- **Descripción**: Agendamiento inteligente de consultas especializadas y generales:
  - Selección dinámica de Especialidad Médica -> Profesional disponible -> Fecha.
  - Cálculo algorítmico de franjas horarias libres (slots de 20 o 30 minutos según la especialidad).
  - **Prevención Matemática de Solapamiento**: El motor de base de datos aplica restricciones GiST temporales que impiden que un mismo profesional tenga dos citas solapadas en el mismo rango horario (`HIS-F-08`).

#### `C.17` — Cancelación y Reprogramación Transaccional de Citas
- **Ruta Principal**: `POST /api/citas/:id/cancelar` | `POST /api/citas/:id/reprogramar`
- **Actores**: `RECEPCIONISTA`, `ADMINISTRADOR`.
- **Descripción**: Gestión de eventualidades y cambios en la agenda:
  - Registro obligatorio del motivo de cancelación (por parte del paciente o de la IPS).
  - Reprogramación atómica dentro de una misma transacción `BEGIN...COMMIT`: la cita previa pasa a estado `REPROGRAMADA` y se inserta la nueva cita liberando y ocupando los slots respectivos sin riesgo de estados inconsistentes.

#### `C.18` — Agenda Médica Diaria, Sala de Espera e Inicio de Atención
- **Ruta Principal**: `GET /agenda` | `POST /api/citas/:id/estado`
- **Actores**: `MEDICO`, `RECEPCIONISTA`, `ENFERMERO`, `ADMINISTRADOR`.
- **Descripción**: Panel operativo para la gestión del flujo físico de pacientes en la clínica:
  - Vista por profesional médico de la agenda del día.
  - **Recepción / Check-In**: El recepcionista marca la llegada del paciente, cambiando el estado de la cita a `EN_SALA`.
  - **Llamado e Inicio de Consulta**: El médico visualiza el semáforo de espera, pulsa "Llamar Paciente" e inicia la atención clínica (la cita transiciona a `EN_ATENCION` y se apertura el registro en `atenciones`).

---

### Área V: Atención Clínica Ambulatoria y Hospitalaria (C.04, C.05, C.06, C.07, C.08, C.09, C.10, C.19, C.20, C.21, C.22)

#### `C.04` — Atención Clínica · Pestaña Consulta y Signos Vitales
- **Ruta Principal**: `GET /atenciones/:id/consulta` | `POST /api/atenciones/:id/consulta`
- **Actores**: `MEDICO`, `ENFERMERO`, `ADMINISTRADOR`.
- **Descripción**: Registro y cálculo de constantes fisiológicas y motivo de atención:
  - Tensión Arterial (Sistólica y Diastólica), Frecuencia Cardíaca, Frecuencia Respiratoria, Temperatura Corporal, Saturación de Oxígeno (SpO2).
  - Somatometría: Peso (kg) y Talla (cm).
  - **Cálculo Reactivo de IMC**: Cálculo instantáneo en el navegador y validación en base de datos con categorización según parámetros OMS (Bajo peso, Normal, Sobrepeso, Obesidad I/II/III).
  - Motivo de Consulta y Enfermedad Actual del paciente.

#### `C.05` — Atención Clínica · Pestaña Antecedentes
- **Ruta Principal**: `GET /atenciones/:id/antecedentes` | `POST /api/atenciones/:id/antecedentes`
- **Actores**: `MEDICO`, `ADMINISTRADOR`.
- **Descripción**: Módulo de registro y consulta de la historia médica previa del paciente:
  - Clasificación en 7 dimensiones clínicas: Patológicos, Familiares, Quirúrgicos, Alérgicos, Farmacológicos, Toxicológicos y Gineco-obstétricos.
  - Visualización acumulada de antecedentes registrados en consultas anteriores.
  - **Alerta de Alergias**: Cualquier alergia activa se proyecta de forma inmediata en el banner superior (`_banner_paciente`) con badge de alta visibilidad para prevenir eventos adversos de prescripción.

#### `C.06` — Atención Clínica · Pestaña Evolución SOAP
- **Ruta Principal**: `GET /atenciones/:id/evolucion` | `POST /api/atenciones/:id/evolucion`
- **Actores**: `MEDICO`, `ADMINISTRADOR`.
- **Descripción**: Estructuración del pensamiento médico conforme a la metodología canónica SOAP:
  - **S (Subjetivo)**: Sintomatología, percepción del dolor y manifestaciones referidas por el paciente.
  - **O (Objetivo)**: Hallazgos positivos y negativos del examen físico por sistemas (cabeza, cuello, tórax, abdomen, extremidades, neurológico).
  - **A (Análisis)**: Raciocinio clínico diagnóstico, correlación sindromática y pronóstico.
  - **P (Plan)**: Plan terapéutico, farmacológico, recomendaciones dietarias y conducta a seguir.
  - Guardado preventivo de borradores en caliente (`infra.borradores`) para evitar pérdida de información por desconexión.

#### `C.07` — Generación de Órdenes Diagnósticas con Detalle CUPS
- **Ruta Principal**: `GET /atenciones/:id/ordenes/nueva` | `POST /api/atenciones/:id/ordenes`
- **Actores**: `MEDICO`, `ADMINISTRADOR`.
- **Descripción**: Prescripción de paraclínicos asistenciales integrados:
  - Selección de exámenes desde el catálogo oficial CUPS (Clasificación Única de Procedimientos en Salud).
  - Clasificación por tipo de servicio: Laboratorio Clínico (LIS) o Imágenes Diagnósticas (RIS).
  - Justificación médica obligatoria, nivel de prioridad (`RUTINA`, `PRIORITARIA`, `URGENTE`) e indicaciones específicas para el bacteriólogo o radiólogo.
  - Detección automática de requerimiento legal de Consentimiento Informado (procedimientos con contraste, invasivos o de sedación).

#### `C.08` — Formato de Impresión de la Orden con Código de Barras
- **Ruta Principal**: `GET /ordenes/:id/imprimir`
- **Vista Canónica Consolidada**: [`src/views/ordenes/orden_impresion.ejs`](src/views/ordenes/orden_impresion.ejs) *(plantilla única homologada; la vista redundante `orden_imprimir.ejs` fue eliminada definitivamente del repositorio)*.
- **Actores**: `MEDICO`, `RECEPCIONISTA`, `ENFERMERO`, `ADMINISTRADOR`.
- **Descripción**: Vista optimizada para impresión física o guardado en PDF de la orden médica:
  - Cabecera con datos de habilitación de la IPS y logotipo institucional.
  - Información completa del paciente (documento, edad, sexo, aseguradora).
  - Detalle de códigos CUPS prescritos con sus nombres normalizados.
  - Renderizado de código de barras bidimensional / lineal (Code128) con el número único de orden para agilizar la lectura con escáner en ventanilla de laboratorio.
  - Cálculo de fecha límite de vigencia de la orden (`ORDEN_VIGENCIA_DIAS`, por defecto 30 días).
  - Firma, registro médico y tarjeta profesional del facultativo emisor.

#### `C.09` — Historia Clínica Longitudinal (Línea de Tiempo)
- **Ruta Principal**: `GET /historias/:pacienteId`
- **Actores**: `MEDICO`, `AUDITOR`, `ADMINISTRADOR`.
- **Descripción**: Visor cronológico inverso integral de la vida clínica del paciente en la institución:
  - Agrupación por atenciones, con despliegue de fechas, profesionales tratantes y especialidades.
  - Acceso directo a signos vitales tomados, evoluciones SOAP, diagnósticos CIE-10 asignados y órdenes generadas con sus respectivos resultados adjuntos.
  - Filtros interactivos por rango de fechas o por tipo de evento clínico.

#### `C.10` — Gestión y Seguimiento de Órdenes Diagnósticas (Bandeja)
- **Ruta Principal**: `GET /ordenes`
- **Vista Canónica Consolidada**: [`src/views/ordenes/ordenes_listado.ejs`](src/views/ordenes/ordenes_listado.ejs) *(plantilla única oficial para la consola de gestión; la vista redundante `ordenes_lista.ejs` fue eliminada del árbol de vistas)*.
- **Actores**: `MEDICO`, `ENFERMERO`, `RECEPCIONISTA`, `ADMINISTRADOR`.
- **Descripción**: Bandeja central de órdenes médicas ambulatorias:
  - Monitoreo del ciclo de vida de cada orden: `PENDIENTE`, `DESPACHADA`, `EN_PROCESO`, `COMPLETADA`, `CANCELADA`.
  - Filtros avanzados por servicio (Laboratorio / Imágenes), fecha de emisión sargable, estado y profesional solicitante.
  - Métricas de consolidado en tiempo real con recuento dinámico por estado.

#### `C.19` — Consentimientos Informados de la Atención
- **Ruta Principal**: `GET /atenciones/:id/consentimientos` | `POST /api/atenciones/:id/consentimientos`
- **Actores**: `MEDICO`, `ADMINISTRADOR`.
- **Descripción**: Módulo de aseguramiento bioético y legal del paciente:
  - Asociación de consentimientos requeridos por la lista de procedimientos CUPS ordenados.
  - Registro de lectura, comprensión de riesgos/beneficios, firma del paciente/acudiente y fecha/hora.
  - Soporte de revocatoria voluntaria de consentimiento.
  - **Compuerta Preventiva de Despacho**: Una orden diagnóstica que exija consentimiento no puede ser despachada a sistemas externos ni procesada en laboratorio hasta que el consentimiento figure formalizado en la base de datos (`C.23`).

#### `C.20` — Codificación de Diagnósticos CIE-10 y Procedimientos CUPS
- **Ruta Principal**: `GET /atenciones/:id/diagnosticos` | `POST /api/atenciones/:id/codificacion`
- **Actores**: `MEDICO`, `ADMINISTRADOR`.
- **Descripción**: Asignación de códigos diagnósticos según la Clasificación Internacional de Enfermedades (CIE-10) y procedimientos realizados en consulta (CUPS):
  - **Catálogos Clínicos Ampliados**: Conjunto de referencia enriquecido con **139 diagnósticos CIE-10** (`MASTER_CIE10`) y **87 procedimientos CUPS** (`MASTER_CUPS`) que abarcan patologías crónicas, agudas, salud mental, imagenología y laboratorio clínico ambulatorio.
  - **Control de Vigencia Temporal**: Tablas `diagnosticos_cie10` y `procedimientos_cups` equipadas con columnas de ciclo de vida (`activo boolean`, `vigente_desde date`, `vigente_hasta date`) y restricciones de integridad (`chk_cie10_vigencia`, `chk_cups_vigencia`). Las búsquedas filtran estrictamente tuplas vigentes (`activo = true AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE) AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)`).
  - Búsqueda predictiva con autocompletar mediante trigramas (`pg_trgm`) por código (ej. `I10X`) o por descripción (ej. `Hipertensión esencial`) con latencias < 500 ms (típicas < 2 ms).
  - **Regla Estricta de Unicidad**: Exige exactamente un diagnóstico clasificado como `PRINCIPAL` y permite hasta 10 diagnósticos `SECUNDARIOS`.
  - Procedimientos clínicos ejecutados durante la sesión con su respectivo código CUPS.
  - **Compuerta para Cierre Clínico**: La atención médica queda bloqueada para cierre definitivo si no tiene un diagnóstico Principal registrado (`HIS-F-19`).

#### `C.21` — Nota de Alta (Epicrisis)
- **Ruta Principal**: `GET /atenciones/:id/epicrisis` | `POST /api/atenciones/:id/epicrisis`
- **Actores**: `MEDICO`, `ADMINISTRADOR`.
- **Descripción**: Resumen médico de egreso y directrices de finalización de la atención:
  - Síntesis de la evolución y respuesta al manejo clínico.
  - Plan de manejo ambulatorio, prescripción farmacológica para el hogar, signos de alarma que ameritan consulta por urgencias y recomendaciones nutricionales.
  - Destino del paciente al egreso (`ALTA_MEDICA`, `REMISIÓN_URGENCIAS`, `INTERCONSULTA_EXTERNA`).

#### `C.22` — Cierre Inmutable con Sello SHA-256 y Adendas Médicas
- **Ruta Principal**: `GET /atenciones/:id/cierre` | `POST /api/atenciones/:id/cierre` | `POST /api/atenciones/:id/adendas`
- **Actores**: `MEDICO`, `ADMINISTRADOR`.
- **Descripción**: Culminación legal y sellado de seguridad de la atención:
  - **Validación de Completitud**: Verifica que la atención tenga signos vitales, SOAP, diagnóstico principal CIE-10 y nota de alta antes de autorizar el cierre.
  - **Sellado Criptográfico SHA-256**: La función de base de datos `fn_atenciones_cierre` concatena los componentes clínicos canónicos, genera el hash criptográfico SHA-256, actualiza el estado a `CERRADA` y almacena la firma digital y marca temporal inalterable.
  - **Bloqueo Inmutable por Trigger**: El trigger `trg_bloquear_modificacion_atencion` aborta con error `P0001` cualquier intento de modificar campos de una atención cerrada.
  - **Mecanismo de Adendas**: Cualquier aclaración o corrección posterior obligatoriamente se registra en la tabla `adendas_atencion`, asociando fecha, hora, médico redactor, justificación y contenido adicional sin alterar la historia original.

---

### Área VI: Centro de Notificaciones y Alertas Clínicas (C.11)

#### `C.11` — Centro de Notificaciones y Alertas Clínicas
- **Ruta Principal**: `GET /notificaciones` | `POST /api/notificaciones/:id/leida`
- **Actores**: Todo el personal asistencial y administrativo.
- **Descripción**: Bandeja centralizada de eventos clínicos de alto impacto:
  - **Alertas de Pánico / Críticas**: Notificación prioritaria cuando el laboratorio carga resultados fuera del umbral biológico seguro.
  - Notificaciones de asignación de nuevas citas, cancelaciones o reprogramaciones en la agenda del profesional.
  - Filtro por estado (`TODAS`, `NO_LEÍDAS`, `LEÍDAS`) y marcación de lectura individual o masiva.

---

### Área VII: Administración y Configuración Hospitalaria (C.12, C.13, C.14)

#### `C.12` — Administración de Usuarios, Roles y Matriz de Permisos
- **Ruta Principal**: `GET /admin/usuarios` | `POST /admin/usuarios` | `POST /admin/usuarios/:id/estado`
- **Actores**: `ADMINISTRADOR`.
- **Descripción**: Módulo de gestión del personal de salud y soporte técnico:
  - Creación de cuentas institucionales con asignación estricta de rol (`ADMINISTRADOR`, `MEDICO`, `ENFERMERO`, `RECEPCIONISTA`, `AUDITOR`).
  - Registro de tarjeta profesional médica, registro de firma y datos de contacto.
  - Activación, suspensión e inactivación de usuarios, así como reseteo administrativo de contraseñas.

#### `C.13` — Especialidades Médicas y Asignación N:M a Profesionales
- **Ruta Principal**: `GET /admin/especialidades` | `POST /admin/especialidades` | `POST /admin/especialidades/asignar`
- **Actores**: `ADMINISTRADOR`.
- **Descripción**: Catálogo de áreas asistenciales de la IPS:
  - Configuración de especialidades (Medicina General, Pediatría, Medicina Interna, Cardiología, Ginecología, etc.).
  - Definición de la duración predeterminada de las citas por especialidad (ej. 20 min vs 30 min).
  - Vinculación relacional N:M entre médicos y especialidades (un médico puede ejercer Medicina General y Urgencias).

#### `C.14` — Catálogo de EPS y Entidades Aseguradoras
- **Ruta Principal**: `GET /admin/aseguradoras` | `POST /admin/aseguradoras`
- **Actores**: `ADMINISTRADOR`.
- **Descripción**: Gestión de entidades pagadoras del Sistema General de Seguridad Social en Salud (SGSSS):
  - Catálogo de EPS (Entidades Promotoras de Salud), ARL, compañías de medicina prepagada y particulares.
  - Códigos oficiales de habilitación de pagador ante la Superintendencia Nacional de Salud.
  - Estado de vigencia de contratos institucionales.

---

### Área VIII: Apoyo Diagnóstico LIS / RIS (C.23, C.24, C.25)

#### `C.23` — Despacho de Órdenes a Sistemas Externos, Reintentos y Reenvío
- **Ruta Principal**: `POST /api/ordenes/:id/despacho`
- **Actores**: `ENFERMERO`, `ADMINISTRADOR`.
- **Descripción**: Motor de interoperabilidad con sistemas de información de laboratorio (LIS) y sistemas de información radiológica (RIS):
  - Enrutamiento transaccional de órdenes médicas.
  - Validación previa de consentimientos informados requeridos.
  - Registro de bitácora de envío, gestión de reintentos exponenciales ante fallas de red y acuse de recibo técnico.

#### `C.24` — Carga de Resultados Diagnósticos con Archivo Validado
- **Ruta Principal**: `GET /resultados/carga` | `POST /api/ordenes/:id/resultados`
- **Actores**: `ENFERMERO`, `ADMINISTRADOR`.
- **Descripción**: Módulo de ingreso de paraclínicos por parte de laboratoristas o personal asistencial:
  - **Seguridad y Validación Binaria de Adjuntos**:
    * Directorio físico configurable mediante variable `UPLOAD_DIR` (por defecto `uploads/resultados`).
    * Límite estricto de tamaño parametrizable con `MAX_UPLOAD_MB` (10 MB por defecto; HTTP 413 ante desbordamiento).
    * Filtro inicial por extensiones autorizadas (`.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`) y tipos MIME.
    * **Inspección de Firmas Mágicas Binarias (Magic Bytes)**: Validador de cabeceras hexadecimales (`%PDF` `0x25 0x50 0x44 0x46`, JPEG `0xFF 0xD8 0xFF`, PNG `0x89 0x50 0x4E 0x47`, WEBP `RIFF...WEBP`). Archivos con discrepancia entre extensión y contenido real son purgados inmediatamente del disco y rechazados con código HTTP 415.
  - Registro de valores numéricos de exámenes y rangos biológicos de referencia.
  - **Detección de Valores de Pánico**: Si el resultado sobrepasa los umbrales críticos de seguridad, el sistema genera de inmediato una alerta clínica urgente de alta prioridad (`C.11`) dirigida al médico tratante.

#### `C.25` — Consulta de Resultados desde el Expediente del Paciente
- **Rutas Principales**: `GET /resultados/:id` | `GET /pacientes/:id/resultados` | `GET /api/resultados/:id/archivo`
- **Actores**: `MEDICO`, `AUDITOR`, `ADMINISTRADOR`.
- **Descripción**: Visualizador clínico de pruebas diagnósticas y visor de soportes documentales:
  - Consulta tabular y gráfica de exámenes de laboratorio organizados por fecha y tipo de prueba.
  - Comparador histórico de evolución de valores biométricos (ej. curva de glucemia o hemoglobina).
  - **Acceso Protegido y Anti-Fugas a Archivos Adjuntos**:
    * Las rutas `/uploads/resultados`, `/uploads` y `/api/resultados/:id/archivo` requieren sesión activa (`sesion`) y rol autorizado (`autorizar('resultados', 'L')`).
    * Prevención activa contra *Path Traversal* (bloqueo inmediato si la ruta contiene `..` o caracteres nulos `\0`).
    * Registro de trazabilidad forense con función PostgreSQL `fn_auditar_consulta`.
    * Cabeceras de seguridad estrictas en cada descarga: `Cache-Control: private, no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, y exclusión de dotfiles (`dotfiles: 'deny'`).

---

### Área IX: Bitácora Forense y Trazabilidad Transaccional (C.26)

#### `C.26` — Bitácora de Auditoría Forense y Reportes de Control
- **Ruta Principal**: `GET /auditoria` | `GET /api/auditoria/verificar-firma/:id`
- **Actores**: `AUDITOR`, `ADMINISTRADOR`.
- **Descripción**: Centro de control forense y trazabilidad médico-legal:
  - Registro inmutable de cada operación de mutación (`INSERT`, `UPDATE`, `DELETE`) en las tablas clínicas y de seguridad, registrando usuario de aplicación, IP, timestamp de precisión y payload JSON anterior y nuevo.
  - **Verificador Criptográfico en Vivo**: Herramienta de auditoría que recalcula el hash SHA-256 de una atención cerrada y lo compara con el hash persistido, certificando que el expediente clínico no ha sufrido adulteraciones ni manipulaciones de base de datos.
  - Filtros avanzados por usuario, rango de fechas, tabla afectada y tipo de evento de seguridad.

---

## 5. Estructura del Repositorio y Directorios

El código fuente se organiza siguiendo los estándares de arquitectura modular de software:

```
HISCARE_IS2/
├── bd/                                  # Scripts SQL DDL/DML unificados de PostgreSQL
│   ├── 01_esquema_y_reglas.sql          # Esquema completo (extensiones, public/infra, 31 tablas, índices, funciones PL/pgSQL, triggers y permisos de hiscare_app)
│   └── 02_seed_datos_prueba.sql         # Seed completo e idempotente (roles, 17 usuarios, 5 especialidades, 6 EPS, CIE-10/CUPS, 200 pacientes y flujo clínico)
├── deploy/                              # Configuraciones de despliegue y endurecimiento web
│   └── nginx/
│       └── hiscare.conf                 # Configuración de proxy inverso Nginx y cabeceras de seguridad HTTPS
├── public/                              # Archivos estáticos servidos al navegador
│   ├── css/                             # Sistema de diseño clínico (tokens, componentes, estilos clínicos, animaciones e impresión)
│   └── js/                              # Scripts cliente (utilidades comunes, CSRF, autocompletar, debounce, validaciones y auditoría)
├── src/                                 # Código fuente del backend Express
│   ├── app.js                           # Punto de entrada de la aplicación y configuración de middlewares
│   ├── config/                          # Parámetros de entorno (entorno.js) y matriz RBAC (permisos.js)
│   ├── controllers/                     # Controladores HTTP de vistas SSR y endpoints JSON
│   ├── db/                              # Pool nativo PostgreSQL, transacciones tx(), mapeo de errores y cargador de catálogos
│   │   └── seeds/
│   │       └── cargar_catalogos.js      # Cargador CLI idempotente de catálogos ampliados CIE-10 (139) y CUPS (87) o CSV externos
│   ├── jobs/                            # Tareas programadas con node-cron (notificaciones.job.js, despacho.job.js)
│   ├── middlewares/                     # Sesión, autorización RBAC, CSRF, upload binario, carga de atención y manejo de errores
│   ├── mock/                            # Simulador local LIS/RIS para desarrollo y pruebas (lis.routes.js)
│   ├── routes/                          # Enrutadores modulares de Express
│   ├── services/                        # Capa de lógica de negocio y dominio clínico
│   ├── validators/                      # Esquemas de validación de entradas (express-validator)
│   └── views/                           # Vistas EJS SSR y partials de interfaz
│       ├── admin/                       # Administración de usuarios, especialidades y EPS (C.12, C.13, C.14)
│       ├── atencion/                    # Pestañas de la consulta clínica (C.4, C.5, C.6, C.7, C.19, C.20, C.21, C.22)
│       ├── auditoria/                   # Bitácora forense de auditoría (C.26)
│       ├── auth/                        # Inicio de sesión (C.1)
│       ├── citas/                       # Agendamiento, gestión de cita y agenda médica (C.16, C.17, C.18)
│       ├── errores/                     # Vistas de control HTTP 403, 404, 500 y 503 (C.27)
│       ├── historias/                   # Línea de tiempo de historia clínica longitudinal (C.9)
│       ├── inicio/                      # Dashboard general por rol (C.2)
│       ├── notificaciones/              # Centro de alertas clínicas (C.11)
│       ├── ordenes/                     # Bandeja e impresión de órdenes diagnósticas (C.8, C.10)
│       ├── pacientes/                   # Registro, búsqueda y ficha única de pacientes (C.3, C.15)
│       ├── partials/                    # Componentes UI reusables (_inicio, _topbar, _sidebar, _banner_paciente, _tabs_atencion)
│       └── resultados/                  # Carga y visor de paraclínicos LIS/RIS (C.24, C.25)
├── tests/                               # Suite de pruebas automatizadas (node:test - 38 archivos)
│   ├── admin/                           # Pruebas de administración, especialidades, aseguradoras y matriz RBAC
│   ├── atencion/                        # Pruebas de vistas y cliente de pestañas asistenciales y órdenes
│   ├── atenciones/                      # Pruebas de integración de consulta, SOAP, diagnósticos, órdenes e historia
│   ├── auditoria/                       # Pruebas de inmutabilidad, bitácora forense y verificación SHA-256
│   ├── auth/                            # Pruebas de login, rate limiting y auditoría de acceso
│   ├── inicio/                          # Pruebas de dashboard C.2, sistema de diseño CSS e integración UI
│   ├── notificaciones/                  # Pruebas de alertas clínicas y permisos por rol
│   ├── pacientes/                       # Pruebas de registro, búsqueda trigram y ficha única
│   ├── seguridad/                       # Pruebas de matriz RBAC y control de excepciones C.27
│   └── *.test.js                        # Pruebas de renderizado de vistas (C.2, órdenes, notificaciones, especialidades)
├── .env.example                         # Plantilla documentada de variables de entorno
├── .gitignore                           # Exclusiones de control de versiones (node_modules, .env, uploads)
├── .nvmrc                               # Versión oficial de Node.js (22 LTS)
├── instalar.bat                         # Asistente de entorno y dependencias para Windows (CMD)
├── instalar.ps1                         # Asistente de entorno y dependencias para PowerShell
├── instalar.sh                          # Asistente de entorno y dependencias para Linux / macOS
├── package.json                         # Metadatos del proyecto, dependencias y scripts npm
└── README.md                            # Documentación principal del repositorio
```

---

## 6. Requisitos de Entorno e Instalación

### Prerrequisitos de Software
- **Node.js**: Versión oficial estandarizada **Node.js 22 LTS** (`engines: ">=22.0.0 <23.0.0"` en `package.json`, `.nvmrc` configurado en `22`).
- **PostgreSQL**: Versión 14, 15 o superior (incluyendo PostgreSQL 18+; requiere permisos de superusuario `postgres` para habilitar extensiones `pgcrypto`, `pg_trgm` y `btree_gist`).
- **Gestor de Paquetes**: `npm` v10+ (incluido nativamente con Node.js 22).

> [!NOTE]
> **Compatibilidad de Entornos Locales vs. Producción Certificada**:
> Los asistentes de entorno (`instalar.ps1` e `instalar.sh`) verifican automáticamente la versión del motor Node.js. Si se detecta un runtime superior al certificado, emiten una advertencia informativa y permiten continuar en modo permisivo local. Para entornos de integración continua (CI/CD) y despliegues productivos de misión crítica, es obligatorio certificar la ejecución sobre el binario oficial **Node.js 22.x LTS**.

---

### Opción A: Preparación Rápida de Entorno + Inicialización SQL

HISCARE incluye asistentes multiplataforma (`instalar.bat`, `instalar.ps1`, `instalar.sh`) para verificar la versión de Node.js/npm, crear el archivo `.env` a partir de `.env.example` e instalar las dependencias de `npm`:

- **En Windows (CMD)**:
  ```cmd
  instalar.bat
  ```
  *(Cuando el asistente pregunte si desea inicializar la base de datos automáticamente, responda `N` y ejecute los scripts SQL de `bd/` descritos en el Paso 4).*

- **En PowerShell (Windows / Linux / macOS)**:
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  .\instalar.ps1 -SkipDb
  ```

- **En Linux / macOS / Git Bash**:
  ```bash
  chmod +x instalar.sh
  ./instalar.sh --skip-db
  ```

Luego inicialice la base de datos PostgreSQL ejecutando los dos scripts unificados de `bd/` con `psql` (ver **Paso 4** a continuación).

---

### Opción B: Instalación Manual Paso a Paso

#### 1. Clonar el Repositorio
```bash
git clone <url-del-repositorio> HISCARE_IS2
cd HISCARE_IS2
```

#### 2. Instalar Dependencias de Node.js
```bash
npm install
```

#### 3. Configurar Variables de Entorno
Copie el archivo de ejemplo y configure los parámetros de conexión a su base de datos local:
```bash
# En Windows (CMD)
copy .env.example .env

# En Linux / macOS / PowerShell
cp .env.example .env
```

#### Matriz Oficial de Variables de Entorno (`.env`)

A continuación se detalla la totalidad de variables gobernadas en `.env.example` y su propósito en la arquitectura hospitalaria:

| Variable | Tipo | Valor Predeterminado (.env.example) | Descripción Técnica y Reglas de Negocio |
| :--- | :---: | :--- | :--- |
| **`DATABASE_URL`** | `String` | `postgresql://hiscare_app:cambiar_en_produccion@127.0.0.1:5432/hiscare` | Cadena de conexión al motor PostgreSQL. El script maestro aprovisiona el rol `hiscare_app` bajo Menor Privilegio (PoLP). En entornos locales de desarrollo con superusuario puede ajustarse a `postgresql://postgres:...`. |
| **`SESSION_SECRET`** | `String` | `cambiar-por-una-cadena-larga` | Clave secreta criptográfica de alta entropía para firma de cookies de sesión (`hiscare.sid`). **Obligatorio cambiar en producción**. |
| **`PORT`** | `Number` | `3000` | Puerto de escucha del servidor HTTP Express. |
| **`NODE_ENV`** | `String` | `development` | Entorno de ejecución (`development`, `test`, `production`). En producción activa políticas estrictas de entorno y deshabilita rutas mock. |
| **`TZ`** | `String` | `America/Bogota` | Zona horaria oficial para consistencia de registros clínicos y auditoría forense (Colombia / Bogotá - UTC-5). |
| **`DOMINIO_CORREO`** | `String` | `hiscare.edu.co` | Dominio corporativo oficial para validación y generación de correos institucionales. |
| **`UPLOAD_DIR`** | `String` | `uploads/resultados` | Ruta física de almacenamiento para archivos diagnósticos adjuntos (C.24 / C.25). Si es relativa, se resuelve respecto a `process.cwd()`. |
| **`MAX_UPLOAD_MB`** | `Number` | `10` | Límite máximo en Megabytes permitido para adjuntos clínicos (`HIS-F-29` / `HIS-E-08`). Si es inválido o no está definido, aplica fallback seguro a 10 MB. |
| **`ORDEN_VIGENCIA_DIAS`** | `Number` | `30` | Días de vigencia estándar para órdenes médicas diagnósticas (Laboratorio y Radiología) antes de su caducidad. |
| **`LIS_URL`** | `String` | `http://127.0.0.1:3000/mock/lis` | Endpoint HTTP para despacho transaccional hacia el Sistema de Información de Laboratorio (LIS). |
| **`RIS_URL`** | `String` | `http://127.0.0.1:3000/mock/ris` | Endpoint HTTP para despacho transaccional hacia el Sistema de Información Radiológica (RIS). |

> [!NOTE]
> **Ausencia Intencional de Variables `SMTP_*`**:
> El archivo `.env.example` **no incluye parámetros `SMTP_*` ni configuraciones de envío de correo electrónico saliente**. El sistema HISCARE opera la recuperación de accesos y credenciales mediante protocolo de seguridad asistencial: ticket ante la Mesa de Ayuda / Sistemas y restablecimiento administrativo en `C.12` marcando la bandera forzada `debe_cambiar_clave = true`.

#### 4. Inicializar y Sembrar la Base de Datos en PostgreSQL

Cree la base de datos `hiscare` (si aún no existe) y ejecute como superusuario (`postgres`) los **2 scripts SQL unificados** de `bd/` en orden estricto:

```bash
# 0. Crear la base de datos destino (solo la primera vez)
psql -U postgres -c "CREATE DATABASE hiscare;"

# 1. Crear extensiones, esquemas (public/infra), 31 tablas, índices, funciones PL/pgSQL, triggers y rol hiscare_app
psql -U postgres -d hiscare -f bd/01_esquema_y_reglas.sql

# 2. Poblar el dataset completo e idempotente de pruebas (5 roles, 17 usuarios, 5 especialidades, 6 EPS, CIE-10/CUPS, 200 pacientes y flujo clínico)
psql -U postgres -d hiscare -f bd/02_seed_datos_prueba.sql
```

Opcionalmente, para sembrar o actualizar de forma aislada e idempotente los **catálogos ampliados CIE-10 (139 códigos) y CUPS (87 códigos)** con sus atributos de vigencia temporal y verificación de índices trigram GIN:

```bash
node -r dotenv/config src/db/seeds/cargar_catalogos.js
# Opcional: cargar archivo CSV personalizado:
# node -r dotenv/config src/db/seeds/cargar_catalogos.js ruta/al/archivo.csv cie10
```

#### 5. Iniciar el Servidor de Aplicación
```bash
# Modo de producción
npm start

# Modo de desarrollo con reinicio automático al guardar cambios
npm run dev
```

El sistema quedará disponible de inmediato en su navegador web en: **`http://localhost:3000`**.

---

## 7. Comandos de Operación y Scripts npm

### Scripts de Aplicación y Pruebas (`npm`)

| Comando | Ejecución Subyacente | Descripción Técnica |
| :--- | :--- | :--- |
| `npm start` | `node -r dotenv/config src/app.js` | Inicia el servidor Express en modo producción cargando `.env`. |
| `npm run dev` | `nodemon -e js,ejs,json -r dotenv/config src/app.js` | Inicia el servidor en modo desarrollo con recarga automática ante cambios en `.js`, `.ejs` y `.json`. |
| `npm test` | `node --test -r dotenv/config tests/...` | Ejecuta la suite completa de 38 archivos de pruebas automatizadas del sistema. |

### Gestión de Base de Datos y Catálogos (`psql` / Node CLI)

| Comando | Descripción Técnica |
| :--- | :--- |
| `psql -U postgres -d hiscare -f bd/01_esquema_y_reglas.sql` | Aplica [`bd/01_esquema_y_reglas.sql`](bd/01_esquema_y_reglas.sql): configura extensiones (`pgcrypto`, `btree_gist`, `pg_trgm`), esquemas `public`/`infra`, 31 tablas, índices, vigencia CIE-10/CUPS, funciones PL/pgSQL, triggers y permisos de `hiscare_app`. |
| `psql -U postgres -d hiscare -f bd/02_seed_datos_prueba.sql` | Aplica [`bd/02_seed_datos_prueba.sql`](bd/02_seed_datos_prueba.sql): limpia de forma segura las 31 tablas e inserta el dataset completo e idempotente de IPS mediana (17 usuarios, 200 pacientes, ~460 citas, ~250 atenciones, órdenes LIS/RIS, resultados y ~28 adendas). |
| `node -r dotenv/config src/db/seeds/cargar_catalogos.js` | Ejecuta [`src/db/seeds/cargar_catalogos.js`](src/db/seeds/cargar_catalogos.js): carga o actualiza de forma idempotente los catálogos ampliados CIE-10 (139) y CUPS (87) con control de vigencia e indexación trigram GIN (admite CSV como argumento). |

---

## 8. Suite de Pruebas Automatizadas

HISCARE incorpora una batería de **38 archivos de pruebas automatizadas** construida sobre el ejecutor nativo de pruebas de Node.js (`node:test` y `node:assert/strict`), garantizando cero dependencias externas de prueba y ejecución directa:

```bash
# Ejecutar todas las pruebas registradas en package.json
npm test
```

### Categorías de Pruebas Incluidas:
1. **Seguridad y Control de Acceso (RBAC)**: Validación de permisos por pantalla y endpoint, rechazo `403 Forbidden` a usuarios no autorizados, expiración de sesiones, rate limiting en autenticación y control de excepciones (`C.27`).
2. **Integridad Transaccional**: Verificación de persistencia de atenciones, signos vitales, evolución SOAP, diagnósticos CIE-10, procedimientos CUPS, órdenes diagnósticas y cálculo reactivo de constantes clínicas.
3. **Inmutabilidad y Auditoría**: Verificación de rechazo de modificaciones `UPDATE`/`DELETE` sobre atenciones cerradas y recálculo de firmas SHA-256 (`fn_verificar_firma`).
4. **Búsqueda Predictiva Trigram**: Certificación de latencia menor a 500 ms en búsquedas fonéticas de pacientes y catálogos CIE-10 / CUPS.
5. **Vistas y Frontend E2E**: Pruebas de integración de renderizado EJS, verificación de atributos `data-trace`, diseño CSS accesible y componentes interactivos.

---

## 9. Directorio Institucional y Credenciales de Prueba

Todas las cuentas de prueba sembradas por [`bd/02_seed_datos_prueba.sql`](bd/02_seed_datos_prueba.sql) tienen configurada la contraseña estandarizada:
> **`Hiscare2026!`** *(hasheada en bcrypt costo 12 vía `pgcrypto`, activa y lista para operar)*.

> [!IMPORTANT]
> **Modo Omni-Permisos de Pruebas para el Administrador (`admin@hiscare.edu.co`)**:
> Con el fin de agilizar evaluaciones funcionales, auditorías de certificación y pruebas de extremo a extremo (E2E) **sin requerir cerrar sesión para cambiar de usuario**, la cuenta de **Administrador HISCARE** cuenta con **omni-permisos asistenciales y de soporte (`L / E`)** sobre todos los módulos del sistema (Agenda, Pacientes, Consulta, SOAP, Órdenes, Resultados, Consentimientos, CIE-10/CUPS, Epicrisis, Cierre Inmutable, Auditoría Forense y Gestión Institucional).
> 
> En base de datos, la regla PL/pgSQL `fn_validar_medico()` autoriza al `ADMINISTRADOR` a fungir como médico responsable de citas y atenciones clínicas, asegurando transacciones ACID sin excepciones relacionales.

### Cuentas Representativas por Rol:

| Rol RBAC | Correo Electrónico | Nombre / Cargo | Ámbito de Acción |
| :--- | :--- | :--- | :--- |
| **`ADMINISTRADOR`** | **`admin@hiscare.edu.co`** | Administrador HISCARE | **Superadministrador E2E**: Control absoluto asistencial, administrativo y de auditoría. |
| **`MEDICO`** | `aperez@hiscare.edu.co` | Dra. Ana Pérez | Medicina General y Medicina Interna (Agenda L-S). |
| **`MEDICO`** | `cgarcia@hiscare.edu.co` | Dr. Carlos García | Medicina General (Agenda L-V). |
| **`MEDICO`** | `smartinez@hiscare.edu.co` | Dra. Sofía Martínez | Pediatría y Medicina General (Agenda L-S). |
| **`MEDICO`** | `fcastro@hiscare.edu.co` | Dr. Fernando Castro | Cardiología y Medicina Interna (Agenda L-V). |
| **`MEDICO`** | `rgomez@hiscare.edu.co` | Dr. Roberto Gómez | Ginecología (Agenda L-V). |
| **`ENFERMERO`** | `dmora@hiscare.edu.co` | Diana Mora | Apoyo asistencial, triaje y toma de muestras. |
| **`ENFERMERO`** | `lsuarez@hiscare.edu.co` | Liliana Suárez | Apoyo diagnóstico y carga técnica LIS/RIS. |
| **`RECEPCIONISTA`** | `lrios@hiscare.edu.co` | Laura Ríos | Admisiones, registro de pacientes y sala de espera. |
| **`RECEPCIONISTA`** | `ctorres@hiscare.edu.co` | Camila Torres | Agendamiento, cancelaciones y reprogramaciones. |
| **`AUDITOR`** | `auditor@hiscare.edu.co` | Auditor Calidad | Auditoría médica de calidad asistencial y verificación SHA-256. |
| **`AUDITOR`** | `hgomez@hiscare.edu.co` | Dr. Hernán Darío Gómez | Auditoría forense y control de tiempos asistenciales. |

*Nota: El seed oficial [`bd/02_seed_datos_prueba.sql`](bd/02_seed_datos_prueba.sql) incluye un total de **17 profesionales y funcionarios institucionales activos** (1 administrador, 8 médicos cubriendo 5 especialidades, 4 enfermeros, 2 recepcionistas y 2 auditores).*

---

## 10. Marco Normativo y Cumplimiento Legal

HISCARE fue concebido para cumplir estrictamente con el marco regulatorio del sector salud en Colombia:

- **Resolución 1995 de 1999 (Ministerio de Salud y Protección Social)**:
  - Establece las normas para el manejo de la Historia Clínica: diligenciamiento secuencial, inmediatez del registro, veracidad, completitud técnica, reserva legal e inalterabilidad de los folios médicos.
  - Implementado mediante el sellado SHA-256 y la compuerta que restringe correcciones a adendas auditadas sin tachaduras ni enmiendas sobre el texto original.
- **Resolución 2275 de 2023 (Ministerio de Salud y Protección Social)**:
  - Reglamenta la generación y transmisión de los Registros Individuales de Prestación de Servicios de Salud (RIPS) como soporte de la Factura Electrónica de Venta en Salud (FEVS) en formato estándar JSON.
  - El sistema garantiza que cada procedimiento CUPS y diagnóstico CIE-10 posea la estructura requerida para su integración con el validador oficial del Ministerio.
- **Codificación Diagnóstica y Procedimental Oficial**:
  - Clasificación Internacional de Enfermedades, Décima Revisión (**CIE-10**).
  - Clasificación Única de Procedimientos en Salud (**CUPS**), estructurada por capítulos de consulta, apoyo diagnóstico, intervenciones y procedimientos quirúrgicos.
- **Ley Estatutaria 1581 de 2012 y Decreto 1377 de 2013 (Habeas Data)**:
  - Protección rigurosa de datos personales sensibles.
  - Registro de auditoría forense sobre cualquier visualización, consulta o exportación de historiales de pacientes.
- **Ley 527 de 1999 (Comercio Electrónico y Firmas Digitales)**:
  - Validez jurídica y probatoria de los mensajes de datos y registros médicos electrónicos respaldados por algoritmos criptográficos hash certificados (FIPS PUB 180-4 SHA-256).

---

### Licencia y Derechos Institucionales
Sistema de Información Hospitalaria desarrollado bajo los lineamientos y especificaciones de ingeniería de software para Instituciones Prestadoras de Servicios de Salud (IPS) colombianas. Todos los derechos reservados © 2026.
