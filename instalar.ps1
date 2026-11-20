<#
.SYNOPSIS
    Script de instalación y preparación de entorno para HISCARE en PowerShell.
.DESCRIPTION
    Verifica Node.js, npm, genera .env, crea carpetas necesarias, instala dependencias
    de npm e inicializa la base de datos PostgreSQL con catálogos y usuarios de prueba.
.PARAMETER SkipDb
    Omite la inicialización de la base de datos.
.PARAMETER Seed
    Ejecuta además el poblado de simulación clínica de 2 semanas.
.PARAMETER Dev
    Arranca inmediatamente el servidor en modo desarrollo al finalizar.
.PARAMETER NonInteractive
    Ejecuta en modo desatendido (no interactivo, ideal para CI/CD y automatización).
.EXAMPLE
    .\instalar.ps1
.EXAMPLE
    .\instalar.ps1 -Seed -Dev
.EXAMPLE
    .\instalar.ps1 -NonInteractive
#>

[CmdletBinding()]
param (
    [switch]$SkipDb,
    [switch]$Seed,
    [switch]$Dev,
    [switch]$NonInteractive
)

# Forzar codificación UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Determinar si el entorno permite interactividad
$isInteractive = -not $NonInteractive -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected

# Asegurar que el directorio actual sea la raíz del script
Set-Location -LiteralPath $PSScriptRoot

function Write-Banner {
    Write-Host @"
===============================================================================
  _    _ _____  _____ _____          _____  ______ 
 | |  | |_   _|/ ____/ ____|   /\   |  __ \|  ____|
 | |__| | | | | (___| |       /  \  | |__) | |__   
 |  __  | | |  \___ \ |      / /\ \ |  _  /|  __|  
 | |  | |_| |_ ____) | |____ / ____ \| | \ \| |____ 
 |_|  |_|_____|_____/ \_____/_/    \_\_|  \_\______|

          SISTEMA DE INFORMACIÓN HOSPITALARIA E HISTORIA CLÍNICA
                      INSTALADOR POWERSHELL NATIVO
===============================================================================
"@ -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Text)
    Write-Host "`n$Text" -ForegroundColor Yellow
}

function Write-Ok {
    param([string]$Text)
    Write-Host "  ✔ $Text" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Text)
    Write-Host "  ⚠ $Text" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Text)
    Write-Host "  ✖ $Text" -ForegroundColor Red
}

if ($isInteractive) {
    try { Clear-Host } catch {}
}
Write-Banner

# -------------------------------------------------------------------------------
# 1. Verificación de Node.js y npm
# -------------------------------------------------------------------------------
Write-Step "[1/4] Verificando entorno de ejecución (Node.js y npm)..."

try {
    $nodeVer = & node -v 2>$null
    if (-not $nodeVer) { throw "Node.js no encontrado" }

    $nodeMajorStr = (& node -e "console.log(process.versions.node.split('.')[0])" 2>$null)
    $nodeMajor = 0
    [int]::TryParse($nodeMajorStr.Trim(), [ref]$nodeMajor) | Out-Null

    if ($nodeMajor -lt 22) {
        Write-Err "Node.js $nodeVer detectado. Se requiere Node.js 22 LTS (versión mínima 22.0.0)."
        Write-Host "`nPor favor descargue e instale la versión oficial Node.js 22 LTS desde: https://nodejs.org/`n" -ForegroundColor Yellow
        if ($isInteractive) { Read-Host "Presione Enter para salir" }
        exit 1
    } elseif ($nodeMajor -gt 22) {
        Write-Warn "Node.js $nodeVer detectado (versión superior no certificada oficialmente; certificada: Node.js 22 LTS)."
        Write-Host "  Continuando ejecución en modo permisivo local (se recomienda Node.js 22 LTS para producción)." -ForegroundColor DarkYellow
    } else {
        Write-Ok "Node.js 22 LTS certificado detectado: $nodeVer"
    }
} catch {
    Write-Err "Node.js no está instalado o no se encuentra en el PATH."
    Write-Host "`nPor favor descargue e instale la versión Node.js 22 LTS desde: https://nodejs.org/`n" -ForegroundColor Yellow
    if ($isInteractive) { Read-Host "Presione Enter para salir" }
    exit 1
}

$npmCmd = "npm"
if ($IsWindows -or $env:OS -like "*Windows*") {
    $npmCmd = "npm.cmd"
}

try {
    $npmVer = & $npmCmd -v 2>$null
    if (-not $npmVer) { throw "npm no encontrado" }
    Write-Ok "Gestor npm detectado: v$npmVer"
} catch {
    Write-Err "npm no se encuentra disponible."
    Write-Host "`nAsegúrese de que el instalador de Node.js haya incluido el gestor de paquetes npm.`n" -ForegroundColor Yellow
    if ($isInteractive) { Read-Host "Presione Enter para salir" }
    exit 1
}

# -------------------------------------------------------------------------------
# 2. Verificación de archivo .env y directorios
# -------------------------------------------------------------------------------
Write-Step "[2/4] Verificando archivo de entorno y directorios locales..."

$envPath = Join-Path $PSScriptRoot ".env"
$envExamplePath = Join-Path $PSScriptRoot ".env.example"

if (-not (Test-Path -LiteralPath $envPath)) {
    if (Test-Path -LiteralPath $envExamplePath) {
        Copy-Item -LiteralPath $envExamplePath -Destination $envPath
        Write-Ok "Archivo .env creado exitosamente a partir de .env.example."
        Write-Warn "Revise DATABASE_URL en .env si utiliza credenciales de PostgreSQL personalizadas."
    } else {
        Write-Warn "No se encontró .env ni .env.example en la raíz."
    }
} else {
    Write-Ok "Archivo de entorno .env detectado."
}

# Carpetas requeridas (adjuntos clínicos uploads/resultados)
$carpetas = @(
    @{ Path = (Join-Path $PSScriptRoot "uploads"); Label = "uploads" },
    @{ Path = (Join-Path $PSScriptRoot "uploads\resultados"); Label = "uploads/resultados" }
)

foreach ($c in $carpetas) {
    if (-not (Test-Path -LiteralPath $c.Path)) {
        New-Item -ItemType Directory -Path $c.Path -Force | Out-Null
        Write-Ok "Directorio creado: $($c.Label)"
    } else {
        Write-Ok "Directorio verificado: $($c.Label)"
    }
}

# -------------------------------------------------------------------------------
# 3. Instalación de dependencias de Node.js
# -------------------------------------------------------------------------------
Write-Step "[3/4] Instalando dependencias de Node.js (npm install)..."
Write-Host "  Descargando módulos necesarios (Express 5, pg, EJS, Helmet, bcryptjs)...`n" -ForegroundColor DarkCyan

$installProc = Start-Process -FilePath $npmCmd -ArgumentList "install" -NoNewWindow -PassThru -Wait
if ($installProc.ExitCode -ne 0) {
    Write-Err "Ocurrió un error al ejecutar 'npm install' (código de salida: $($installProc.ExitCode))."
    if ($isInteractive) { Read-Host "Presione Enter para salir" }
    exit $installProc.ExitCode
}
Write-Ok "Dependencias de Node.js instaladas correctamente."

# -------------------------------------------------------------------------------
# 4. Inicialización de la Base de Datos PostgreSQL
# -------------------------------------------------------------------------------
Write-Step "[4/4] Verificación e Inicialización de la Base de Datos PostgreSQL..."

$ejecutarDb = $false

if ($SkipDb) {
    Write-Host "  ℹ Parámetro -SkipDb especificado. Omitiendo inicialización de BD." -ForegroundColor DarkGray
} else {
    if ($isInteractive) {
        $resp = Read-Host "`n  ¿Desea inicializar/verificar la base de datos ahora? (S/N) [S]"
        if ([string]::IsNullOrWhiteSpace($resp) -or $resp.Trim().ToUpper() -eq "S") {
            $ejecutarDb = $true
        }
    } else {
        $ejecutarDb = $true
    }
}

if ($ejecutarDb) {
    $dbArgs = if ($Seed) { "run db:setup:seed" } else { "run db:setup" }
    Write-Host "`n  Ejecutando: $npmCmd $dbArgs`n" -ForegroundColor Cyan
    
    $dbProc = Start-Process -FilePath $npmCmd -ArgumentList $dbArgs -NoNewWindow -PassThru -Wait
    if ($dbProc.ExitCode -ne 0) {
        Write-Warn "No se pudo completar la configuración automática de la base de datos."
        Write-Host "  Verifique que el servicio de PostgreSQL esté iniciado y que las credenciales en .env sean correctas." -ForegroundColor DarkYellow
        Write-Host "  Puede volver a intentarlo en cualquier momento ejecutando: npm run db:setup`n" -ForegroundColor DarkYellow
    } else {
        Write-Ok "Base de datos configurada y verificada exitosamente."
    }
}

# -------------------------------------------------------------------------------
# Resumen y Pantalla Final
# -------------------------------------------------------------------------------
Write-Host @"

===============================================================================
            ✔ INSTALACIÓN Y PREPARACIÓN DE HISCARE COMPLETADA
===============================================================================

  🌐 ACCESO A LA APLICACIÓN WEB:
     URL Local: http://localhost:3000

  🔑 CREDENCIALES DE ACCESO PREDETERMINADAS (Contraseña: Hiscare2026!):
     • Superadministrador:     admin@hiscare.edu.co     (Rol: ADMINISTRADOR - Omni-permisos)
     • Médico Tratante:        aperez@hiscare.edu.co    (Rol: MEDICO - Dra. Ana Pérez)
     • Médico Especialista:    cgarcia@hiscare.edu.co   (Rol: MEDICO - Dr. Carlos García)
     • Admisiones / Citas:     lrios@hiscare.edu.co     (Rol: RECEPCIONISTA - Laura Ríos)
     • Personal Enfermería:    dmora@hiscare.edu.co     (Rol: ENFERMERO - Diana Mora)
     • Auditoría Médica:       auditor@hiscare.edu.co   (Rol: AUDITOR - Auditor de Calidad)

  📋 COMANDOS DISPONIBLES:
     • Modo Desarrollo:        npm run dev
     • Modo Producción:        npm start
     • Configurar Base Datos:  npm run db:setup
     • Datos de Prueba:        npm run db:seed
     • Catálogos CIE-10/CUPS:  npm run db:catalogos
     • Suite de Pruebas:       npm test

===============================================================================
"@ -ForegroundColor Green

$iniciar = $Dev
if (-not $Dev -and $isInteractive) {
    $respApp = Read-Host "¿Desea iniciar HISCARE en modo desarrollo ahora mismo? (S/N) [S]"
    if ([string]::IsNullOrWhiteSpace($respApp) -or $respApp.Trim().ToUpper() -eq "S") {
        $iniciar = $true
    }
}

if ($iniciar) {
    Write-Host "`n[HISCARE] Iniciando servidor en modo desarrollo (npm run dev)..." -ForegroundColor Cyan
    Write-Host "(Presione Ctrl+C para detener el servidor)`n" -ForegroundColor DarkGray
    & $npmCmd run dev
} else {
    Write-Host "`nInstalación finalizada. ¡Éxitos con HISCARE!`n" -ForegroundColor Cyan
}
