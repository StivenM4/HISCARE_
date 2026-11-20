@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

title HISCARE - Instalador y Preparador de Entorno

REM Asegurar que el directorio de trabajo sea la raiz del proyecto
cd /d "%~dp0"

echo ===============================================================================
echo     _    _ _____  _____ _____          _____  ______ 
echo    ^| ^|  ^| ^|_   _^|/ ____/ ____^|   /\   ^|  __ \^|  ____^|
echo    ^| ^|__^| ^| ^| ^| ^| (___^| ^|       /  \  ^| ^|__) ^| ^|__   
echo    ^|  __  ^| ^| ^|  \___ \ ^|      / /\ \ ^|  _  /^|  __^|  
echo    ^| ^|  ^| ^|_^| ^|_ ____) ^| ^|____ / ____ \^| ^| \ \^| ^|____ 
echo    ^|_^|  ^|_^|_____^|_____/ \_____/_/    \_\_^|  \_\______^|
echo.
echo           SISTEMA DE INFORMACION HOSPITALARIA E HISTORIA CLINICA
echo                        INSTALADOR AUTOMATICO
echo ===============================================================================
echo.

REM -----------------------------------------------------------------------------
REM 1. Verificacion de Node.js y npm
REM -----------------------------------------------------------------------------
echo [1/4] Verificando entorno de ejecucion [Node.js y npm]...

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR CRITICO] Node.js no esta instalado o no se encuentra en el PATH.
    echo.
    echo Por favor descargue e instale la version oficial Node.js 22 LTS desde: https://nodejs.org/
    echo.
    echo Una vez instalado, cierre esta ventana y vuelva a ejecutar instalar.bat.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VERSION=%%v
for /f "tokens=*" %%m in ('node -e "console.log(process.versions.node.split('.')[0])" 2^>nul') do set NODE_MAJOR=%%m

if not defined NODE_MAJOR set NODE_MAJOR=0

if !NODE_MAJOR! LSS 22 (
    echo.
    echo [ERROR CRITICO] Node.js !NODE_VERSION! detectado. Se requiere Node.js 22 LTS [version minima 22.0.0].
    echo Por favor descargue e instale la version certificada Node.js 22 LTS desde: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if !NODE_MAJOR! GTR 22 (
    echo   [ADVERTENCIA] Node.js !NODE_VERSION! detectado [version superior no certificada oficialmente; certificada: 22 LTS].
    echo   Se continuara la ejecucion en modo permisivo local. Se recomienda Node.js 22 LTS para produccion.
) else (
    echo   [OK] Node.js 22 LTS certificado detectado: !NODE_VERSION!
)

where npm.cmd >nul 2>&1
if %ERRORLEVEL% neq 0 (
    where npm >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [ERROR CRITICO] npm no esta disponible en el PATH del sistema.
        echo Reinstale Node.js marcando la casilla de herramientas de npm.
        echo.
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%v in ('call npm.cmd -v 2^>nul') do set NPM_VERSION=%%v
echo   [OK] Gestor npm detectado: v!NPM_VERSION!
echo.

REM -----------------------------------------------------------------------------
REM 2. Verificacion de archivo .env y directorios locales
REM -----------------------------------------------------------------------------
echo [2/4] Verificando archivo de entorno y directorios locales...

if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo   [OK] Archivo .env creado a partir de .env.example.
        echo   [AVISO] Verifique DATABASE_URL en .env si utiliza credenciales personalizadas.
    ) else (
        echo   [AVISO] No se encontro .env ni .env.example en la raiz.
    )
) else (
    echo   [OK] Archivo de entorno .env detectado.
)

REM Creacion de carpetas requeridas (adjuntos clinicos uploads/resultados)
if not exist "uploads" (
    mkdir "uploads"
    echo   [OK] Directorio uploads creado.
)
if not exist "uploads\resultados" (
    mkdir "uploads\resultados"
    echo   [OK] Directorio uploads/resultados creado.
) else (
    echo   [OK] Directorio uploads/resultados verificado.
)
echo.

REM -----------------------------------------------------------------------------
REM 3. Instalacion de dependencias de Node.js
REM -----------------------------------------------------------------------------
echo [3/4] Instalando dependencias de Node.js [npm install]...
echo   Descargando modulos necesarios [Express 5, pg, EJS, Helmet, bcryptjs]...
echo.

call npm.cmd install
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Ocurrio un fallo durante la instalacion de paquetes con npm.
    echo Verifique su conexion a internet e intente ejecutar npm install manualmente.
    echo.
    pause
    exit /b 1
)
echo.
echo   [OK] Dependencias de Node.js instaladas correctamente.
echo.

REM -----------------------------------------------------------------------------
REM 4. Inicializacion de la Base de Datos PostgreSQL
REM -----------------------------------------------------------------------------
echo [4/4] Verificacion e Inicializacion de la Base de Datos...
echo.
echo   El instalador puede verificar y preparar automaticamente el esquema relacional,
echo   funciones PL/pgSQL, seguridad RBAC y catalogos clinicos en PostgreSQL.
echo.

set INIT_DB=S
set /p INIT_DB="Desea inicializar/verificar la base de datos ahora? [S/N, defecto S]: "

if /i "!INIT_DB!"=="S" (
    echo.
    echo   Ejecutando configuracion de base de datos con npm run db:setup...
    echo.
    call npm.cmd run db:setup
    if !ERRORLEVEL! neq 0 (
        echo.
        echo   [ADVERTENCIA] No se pudo completar la configuracion automatica de la BD.
        echo   Posibles causas:
        echo     1. El servicio de PostgreSQL no esta iniciado.
        echo     2. La contrasena o puerto en DATABASE_URL dentro de .env difiere de su servidor.
        echo.
        echo   Podra reintentar la inicializacion en cualquier momento ejecutando:
        echo     npm run db:setup
        echo.
    ) else (
        echo   [OK] Base de datos configurada y verificada exitosamente.
    )
) else (
    echo   [INFO] Inicializacion de base de datos omitida.
    echo   Recuerde ejecutar npm run db:setup antes de iniciar la aplicacion.
)
echo.

REM -----------------------------------------------------------------------------
REM Resumen y Pantalla Final
REM -----------------------------------------------------------------------------
echo ===============================================================================
echo           [EXITO] INSTALACION Y PREPARACION DE HISCARE COMPLETADA
echo ===============================================================================
echo.
echo   ACCESO A LA APLICACION WEB:
echo      URL Local: http://localhost:3000
echo.
echo   CREDENCIALES DE ACCESO PREDETERMINADAS [Contrasena: Hiscare2026!]:
echo      * Superadministrador [Omni-permisos]: admin@hiscare.edu.co
echo      * Medico Tratante:                   aperez@hiscare.edu.co
echo      * Medico Especialista:               cgarcia@hiscare.edu.co
echo      * Recepcion y Citas:                 lrios@hiscare.edu.co
echo      * Personal de Enfermeria:            dmora@hiscare.edu.co
echo      * Auditoria de Calidad:              auditor@hiscare.edu.co
echo.
echo   COMANDOS UTILES:
echo      * Modo Desarrollo [recarga auto]:    npm run dev
echo      * Modo Produccion:                   npm start
echo      * Configuracion de Base de Datos:    npm run db:setup
echo      * Poblado de Datos de Prueba:        npm run db:seed
echo      * Catalogos CIE-10 y CUPS:           npm run db:catalogos
echo      * Ejecutar Suite de Pruebas:         npm test
echo.
echo ===============================================================================
echo.

set START_DEV=N
set /p START_DEV="Desea iniciar HISCARE en modo desarrollo ahora mismo? [S/N, defecto N]: "
set INICIAR_APP=!START_DEV!

if /i "!START_DEV!"=="S" (
    echo.
    echo [HISCARE] Iniciando servidor en modo desarrollo con npm run dev...
    echo Presione Ctrl+C para detener el servidor.
    echo.
    call npm.cmd run dev
)

echo.
echo Presione cualquier tecla para cerrar esta ventana...
pause >nul