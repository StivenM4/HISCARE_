#!/usr/bin/env bash
# ===============================================================================
# HISCARE - Instalador y Preparador de Entorno para Linux / macOS / Unix
# ===============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Definición de colores ANSI
CLR_RESET='\033[0m'
CLR_BOLD='\033[1m'
CLR_CYAN='\033[0;36m'
CLR_GREEN='\033[0;32m'
CLR_YELLOW='\033[0;33m'
CLR_RED='\033[0;31m'
CLR_BLUE='\033[0;34m'

# Parseo de argumentos de línea de comandos
SKIP_DB=false
SEED_DB=false
START_DEV=false

for arg in "$@"; do
    case "$arg" in
        --skip-db) SKIP_DB=true ;;
        --seed)    SEED_DB=true ;;
        --dev)     START_DEV=true ;;
    esac
done

echo -e "${CLR_CYAN}${CLR_BOLD}"
cat << "EOF"
===============================================================================
  _    _ _____  _____ _____          _____  ______ 
 | |  | |_   _|/ ____/ ____|   /\   |  __ \|  ____|
 | |__| | | | | (___| |       /  \  | |__) | |__   
 |  __  | | |  \___ \ |      / /\ \ |  _  /|  __|  
 | |  | |_| |_ ____) | |____ / ____ \| | \ \| |____ 
 |_|  |_|_____|_____/ \_____/_/    \_\_|  \_\______|

          SISTEMA DE INFORMACIÓN HOSPITALARIA E HISTORIA CLÍNICA
                      INSTALADOR UNIX / LINUX / MACOS
===============================================================================
EOF
echo -e "${CLR_RESET}"

# -------------------------------------------------------------------------------
# 1. Verificación de Node.js y npm
# -------------------------------------------------------------------------------
echo -e "${CLR_YELLOW}[1/4] Verificando entorno de ejecución (Node.js y npm)...${CLR_RESET}"

if ! command -v node >/dev/null 2>&1; then
    echo -e "${CLR_RED}  ✖ Error: Node.js no está instalado o no se encuentra en el PATH.${CLR_RESET}"
    echo -e "    Instale la versión oficial Node.js 22 LTS desde: https://nodejs.org/"
    exit 1
fi
NODE_VER=$(node -v)
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo "0")

if [ "$NODE_MAJOR" -lt 22 ]; then
    echo -e "${CLR_RED}  ✖ Error: Node.js ${NODE_VER} detectado. Se requiere Node.js 22 LTS (versión mínima 22.0.0).${CLR_RESET}"
    echo -e "    Por favor actualice a la versión certificada Node.js 22 LTS desde: https://nodejs.org/"
    exit 1
elif [ "$NODE_MAJOR" -gt 22 ]; then
    echo -e "${CLR_YELLOW}  ⚠ Advertencia: Node.js ${NODE_VER} detectado (versión superior no certificada oficialmente; certificada: 22 LTS).${CLR_RESET}"
    echo -e "${CLR_YELLOW}    Se continuará la ejecución en modo permisivo local. Se recomienda Node.js 22 LTS para producción.${CLR_RESET}"
else
    echo -e "${CLR_GREEN}  ✔ Node.js 22 LTS certificado detectado: ${NODE_VER}${CLR_RESET}"
fi

if ! command -v npm >/dev/null 2>&1; then
    echo -e "${CLR_RED}  ✖ Error: npm no está disponible.${CLR_RESET}"
    exit 1
fi
NPM_VER=$(npm -v)
echo -e "${CLR_GREEN}  ✔ Gestor npm detectado: v${NPM_VER}${CLR_RESET}"
echo ""

# -------------------------------------------------------------------------------
# 2. Verificación de archivo .env y directorios locales
# -------------------------------------------------------------------------------
echo -e "${CLR_YELLOW}[2/4] Verificando archivo de entorno y directorios locales...${CLR_RESET}"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp ".env.example" ".env"
        chmod 600 .env
        echo -e "${CLR_GREEN}  ✔ Archivo .env creado a partir de .env.example (permisos 600 asegurados).${CLR_RESET}"
        echo -e "${CLR_YELLOW}  ℹ NOTA: Verifique la variable DATABASE_URL en .env con sus credenciales de PostgreSQL.${CLR_RESET}"
    else
        echo -e "${CLR_YELLOW}  ⚠ Archivo .env.example no encontrado.${CLR_RESET}"
    fi
else
    chmod 600 .env 2>/dev/null || true
    echo -e "${CLR_GREEN}  ✔ Archivo de entorno .env detectado.${CLR_RESET}"
fi

mkdir -p uploads/resultados
echo -e "${CLR_GREEN}  ✔ Directorio 'uploads/resultados' verificado.${CLR_RESET}"
echo ""

# -------------------------------------------------------------------------------
# 3. Instalación de dependencias de Node.js
# -------------------------------------------------------------------------------
echo -e "${CLR_YELLOW}[3/4] Instalando dependencias de Node.js (npm install)...${CLR_RESET}"
echo -e "  Descargando módulos necesarios (Express 5, pg, EJS, Helmet, bcryptjs)..."
echo ""

npm install
echo ""
echo -e "${CLR_GREEN}  ✔ Dependencias de Node.js instaladas correctamente.${CLR_RESET}"
echo ""

# -------------------------------------------------------------------------------
# 4. Inicialización de la Base de Datos PostgreSQL
# -------------------------------------------------------------------------------
echo -e "${CLR_YELLOW}[4/4] Verificación e Inicialización de la Base de Datos PostgreSQL...${CLR_RESET}"

EJECUTAR_DB=false
if [ "$SKIP_DB" = true ]; then
    echo -e "  ℹ Bandera --skip-db detectada. Omitiendo inicialización de BD."
else
    if [ -t 0 ]; then
        read -r -p "¿Desea inicializar/verificar la base de datos ahora? (S/N) [S]: " RESP_DB
        RESP_DB=${RESP_DB:-S}
        if [[ "$RESP_DB" =~ ^[Ss]$ ]]; then
            EJECUTAR_DB=true
        fi
    else
        EJECUTAR_DB=true
    fi
fi

if [ "$EJECUTAR_DB" = true ]; then
    echo ""
    if [ "$SEED_DB" = true ]; then
        echo -e "  Ejecutando configuración y simulación (npm run db:setup:seed)..."
        npm run db:setup:seed || echo -e "${CLR_YELLOW}  ⚠ La configuración de BD arrojó advertencias. Revise DATABASE_URL.${CLR_RESET}"
    else
        echo -e "  Ejecutando configuración de base de datos (npm run db:setup)..."
        npm run db:setup || echo -e "${CLR_YELLOW}  ⚠ La configuración de BD arrojó advertencias. Revise DATABASE_URL.${CLR_RESET}"
    fi
fi
echo ""

# -------------------------------------------------------------------------------
# Resumen y Pantalla Final
# -------------------------------------------------------------------------------
echo -e "${CLR_GREEN}${CLR_BOLD}"
cat << "EOF"
===============================================================================
            ✔ INSTALACIÓN Y PREPARACIÓN DE HISCARE COMPLETADA
===============================================================================
EOF
echo -e "${CLR_RESET}"

echo -e "  🌐 ${CLR_BOLD}ACCESO A LA APLICACIÓN WEB:${CLR_RESET}"
echo -e "     URL Local: ${CLR_CYAN}http://localhost:3000${CLR_RESET}"
echo ""
echo -e "  🔑 ${CLR_BOLD}CREDENCIALES DE ACCESO PREDETERMINADAS (Contraseña: Hiscare2026!):${CLR_RESET}"
echo -e "     • Superadministrador:     ${CLR_CYAN}admin@hiscare.edu.co${CLR_RESET}     (Rol: ADMINISTRADOR - Omni-permisos)"
echo -e "     • Médico Tratante:        ${CLR_CYAN}aperez@hiscare.edu.co${CLR_RESET}    (Rol: MEDICO - Dra. Ana Pérez)"
echo -e "     • Médico Especialista:    ${CLR_CYAN}cgarcia@hiscare.edu.co${CLR_RESET}   (Rol: MEDICO - Dr. Carlos García)"
echo -e "     • Admisiones y Citas:     ${CLR_CYAN}lrios@hiscare.edu.co${CLR_RESET}     (Rol: RECEPCIONISTA - Laura Ríos)"
echo -e "     • Enfermería:             ${CLR_CYAN}dmora@hiscare.edu.co${CLR_RESET}     (Rol: ENFERMERO - Diana Mora)"
echo -e "     • Auditoría Médica:       ${CLR_CYAN}auditor@hiscare.edu.co${CLR_RESET}   (Rol: AUDITOR - Auditor de Calidad)"
echo ""
echo -e "  📋 ${CLR_BOLD}COMANDOS DISPONIBLES:${CLR_RESET}"
echo -e "     • Modo Desarrollo:        ${CLR_YELLOW}npm run dev${CLR_RESET}"
echo -e "     • Modo Producción:        ${CLR_YELLOW}npm start${CLR_RESET}"
echo -e "     • Configurar Base Datos:  ${CLR_YELLOW}npm run db:setup${CLR_RESET}"
echo -e "     • Datos de Prueba:        ${CLR_YELLOW}npm run db:seed${CLR_RESET}"
echo -e "     • Catálogos CIE-10/CUPS:  ${CLR_YELLOW}npm run db:catalogos${CLR_RESET}"
echo -e "     • Suite de Pruebas:       ${CLR_YELLOW}npm test${CLR_RESET}"
echo ""
echo -e "==============================================================================="
echo ""

if [ "$START_DEV" = false ] && [ -t 0 ]; then
    read -r -p "¿Desea iniciar HISCARE en modo desarrollo ahora mismo? (S/N) [S]: " RESP_APP
    RESP_APP=${RESP_APP:-S}
    if [[ "$RESP_APP" =~ ^[Ss]$ ]]; then
        START_DEV=true
    fi
fi

if [ "$START_DEV" = true ]; then
    echo -e "${CLR_CYAN}\n[HISCARE] Iniciando servidor en modo desarrollo (npm run dev)...${CLR_RESET}"
    echo -e "Presione Ctrl+C para detener el servidor.\n"
    npm run dev
else
    echo -e "${CLR_CYAN}Instalación finalizada. ¡Éxitos con HISCARE!${CLR_RESET}\n"
fi
