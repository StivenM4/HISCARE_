#!/usr/bin/env bash
# ==============================================================================
# HISCARE - Script de Aprovisionamiento y Despliegue Automatizado en Ubuntu Server
# ==============================================================================
# Uso:
#   Ejecutar desde la raíz del proyecto (donde se encuentra package.json):
#     bash deploy/setup_ubuntu.sh
#
# Compatibilidad:
#   Ubuntu Server 22.04 LTS / 24.04 LTS
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Colores y utilidades de salida
# ------------------------------------------------------------------------------
CLR_RESET='\033[0m'
CLR_BOLD='\033[1m'
CLR_CYAN='\033[0;36m'
CLR_GREEN='\033[0;32m'
CLR_YELLOW='\033[0;33m'
CLR_RED='\033[0;31m'

log_info()    { echo -e "${CLR_CYAN}ℹ $*${CLR_RESET}"; }
log_ok()      { echo -e "${CLR_GREEN}✔ $*${CLR_RESET}"; }
log_warn()    { echo -e "${CLR_YELLOW}⚠ $*${CLR_RESET}"; }
log_error()   { echo -e "${CLR_RED}✖ $*${CLR_RESET}" >&2; }
log_step()    { echo -e "\n${CLR_YELLOW}${CLR_BOLD}[$1] $2${CLR_RESET}"; }

# ------------------------------------------------------------------------------
# 1. Verificación de directorio raíz del proyecto y privilegios
# ------------------------------------------------------------------------------
PROJECT_ROOT="$(pwd)"

if [ ! -f "$PROJECT_ROOT/package.json" ] || [ ! -f "$PROJECT_ROOT/src/app.js" ]; then
    log_error "Este script debe ejecutarse desde la raíz del proyecto HISCARE (donde se encuentra package.json)."
    echo -e "  Ejemplo de uso:"
    echo -e "    ${CLR_CYAN}cd /ruta/a/HISCARE_IS2${CLR_RESET}"
    echo -e "    ${CLR_CYAN}bash deploy/setup_ubuntu.sh${CLR_RESET}"
    exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
    log_error "No se detectó 'apt-get'. Este script está diseñado para Ubuntu Server (22.04 / 24.04 LTS)."
    exit 1
fi

if [ "${EUID:-$(id -u)}" -eq 0 ]; then
    SUDO=""
else
    if ! command -v sudo >/dev/null 2>&1; then
        log_error "Se requieren privilegios de administrador (root o sudo) para instalar paquetes y configurar servicios."
        exit 1
    fi
    SUDO="sudo"
    log_info "Validando permisos de sudo..."
    $SUDO -v
fi

run_as_postgres() {
    local sql="$1"
    if [ "${EUID:-$(id -u)}" -eq 0 ]; then
        printf '%s\n' "$sql" | (cd /tmp && su -s /bin/bash postgres -c "psql -v ON_ERROR_STOP=1 -tA")
    else
        printf '%s\n' "$sql" | (cd /tmp && $SUDO -u postgres psql -v ON_ERROR_STOP=1 -tA)
    fi
}

echo -e "${CLR_CYAN}${CLR_BOLD}"
cat << "EOF"
================================================================================
   _    _ _____  _____ _____          _____  ______
  | |  | |_   _|/ ____/ ____|   /\   |  __ \|  ____|
  | |__| | | | | (___| |       /  \  | |__) | |__
  |  __  | | |  \___ \ |      / /\ \ |  _  /|  __|
  | |  | |_| |_ ____) | |____ / ____ \| | \ \| |____
  |_|  |_|_____|_____/ \_____/_/    \_\_|  \_\______|

        DESPLIEGUE AUTOMATIZADO EN UBUNTU SERVER (22.04 / 24.04 LTS)
================================================================================
EOF
echo -e "${CLR_RESET}"

log_ok "Raíz del proyecto verificada: $PROJECT_ROOT"

# ------------------------------------------------------------------------------
# 2. Actualización de APT e instalación de paquetes base
# ------------------------------------------------------------------------------
log_step "1/9" "Actualizando índices APT e instalando paquetes base del sistema..."

export DEBIAN_FRONTEND=noninteractive
$SUDO apt-get update -y
$SUDO apt-get install -y \
    ca-certificates \
    gnupg \
    curl \
    git \
    nginx \
    postgresql \
    postgresql-contrib \
    ufw \
    openssh-server

$SUDO systemctl enable --now postgresql
$SUDO systemctl enable --now nginx
$SUDO systemctl enable --now ssh >/dev/null 2>&1 || $SUDO systemctl enable --now openssh >/dev/null 2>&1 || true

log_ok "Paquetes base instalados y servicios habilitados (postgresql, nginx, ssh)."

# ------------------------------------------------------------------------------
# 3. Instalación de Node.js 22 LTS y PM2
# ------------------------------------------------------------------------------
log_step "2/9" "Verificando e instalando Node.js 22 LTS y PM2..."

INSTALL_NODE=false
if ! command -v node >/dev/null 2>&1; then
    INSTALL_NODE=true
    log_info "Node.js no está instalado. Se instalará Node.js 22 LTS via NodeSource..."
else
    NODE_VER="$(node -v)"
    NODE_MAJOR="$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo "0")"
    if [ "$NODE_MAJOR" -lt 22 ]; then
        INSTALL_NODE=true
        log_warn "Node.js $NODE_VER detectado (< v22). Actualizando a Node.js 22 LTS..."
    else
        log_ok "Node.js compatible detectado: $NODE_VER"
    fi
fi

if [ "$INSTALL_NODE" = true ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
    $SUDO apt-get install -y nodejs
    log_ok "Node.js instalado: $(node -v) (npm $(npm -v))"
fi

if ! command -v pm2 >/dev/null 2>&1; then
    log_info "Instalando PM2 globalmente..."
    $SUDO npm install -g pm2
    log_ok "PM2 instalado: v$(pm2 -v)"
else
    log_ok "PM2 ya está instalado: v$(pm2 -v)"
fi

# ------------------------------------------------------------------------------
# 4. Configuración interactiva de parámetros de despliegue
# ------------------------------------------------------------------------------
log_step "3/9" "Configuración interactiva del entorno HISCARE..."

DEFAULT_DB_NAME="hiscarebd"
DEFAULT_PG_PASS="12345"
DEFAULT_DOMAINS="hiscare.com www.hiscare.com hiscare.local"
DEFAULT_APP_PORT="3000"

if [ -t 0 ]; then
    read -r -p "Nombre de la base de datos PostgreSQL [${DEFAULT_DB_NAME}]: " DB_NAME || true
    DB_NAME="${DB_NAME:-$DEFAULT_DB_NAME}"

    read -r -s -p "Contraseña para el usuario PostgreSQL 'postgres' [${DEFAULT_PG_PASS}]: " PG_PASS || true
    echo ""
    PG_PASS="${PG_PASS:-$DEFAULT_PG_PASS}"

    read -r -p "Dominios para Nginx server_name [${DEFAULT_DOMAINS}]: " NGINX_DOMAINS || true
    NGINX_DOMAINS="${NGINX_DOMAINS:-$DEFAULT_DOMAINS}"

    read -r -p "Puerto interno de la aplicación Node.js [${DEFAULT_APP_PORT}]: " APP_PORT || true
    APP_PORT="${APP_PORT:-$DEFAULT_APP_PORT}"
else
    log_warn "Entrada no interactiva detectada. Usando valores por defecto."
    DB_NAME="$DEFAULT_DB_NAME"
    PG_PASS="$DEFAULT_PG_PASS"
    NGINX_DOMAINS="$DEFAULT_DOMAINS"
    APP_PORT="$DEFAULT_APP_PORT"
fi

if [[ ! "$DB_NAME" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    log_error "Nombre de base de datos inválido: '$DB_NAME'. Use solo letras, números y guiones bajos (sin iniciar por número)."
    exit 1
fi

if [[ ! "$APP_PORT" =~ ^[0-9]+$ ]] || [ "$APP_PORT" -lt 1 ] || [ "$APP_PORT" -gt 65535 ]; then
    log_error "Puerto inválido: '$APP_PORT'. Debe ser un número entre 1 y 65535."
    exit 1
fi

log_ok "Parámetros definidos -> BD: '$DB_NAME' | Puerto: $APP_PORT | Dominios: $NGINX_DOMAINS"

# ------------------------------------------------------------------------------
# 5. Configuración de PostgreSQL
# ------------------------------------------------------------------------------
log_step "4/9" "Configurando PostgreSQL (usuario 'postgres' y base de datos '$DB_NAME')..."

PG_PASS_SQL="${PG_PASS//\'/\'\'}"
run_as_postgres "ALTER USER postgres WITH PASSWORD '${PG_PASS_SQL}';" >/dev/null
log_ok "Contraseña del usuario 'postgres' actualizada."

DB_EXISTS="$(run_as_postgres "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}';" || true)"
if [ "$DB_EXISTS" = "1" ]; then
    log_ok "La base de datos '$DB_NAME' ya existe (no se recrea)."
else
    run_as_postgres "CREATE DATABASE \"${DB_NAME}\" WITH ENCODING 'UTF8';" >/dev/null
    log_ok "Base de datos '$DB_NAME' creada correctamente."
fi

# ------------------------------------------------------------------------------
# 6. Generación de .env y directorios requeridos
# ------------------------------------------------------------------------------
log_step "5/9" "Generando archivo .env y creando directorios locales..."

PG_PASS_URL="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$PG_PASS")"
SESSION_SECRET_VAL="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
DATABASE_URL_VAL="postgresql://postgres:${PG_PASS_URL}@127.0.0.1:5432/${DB_NAME}"

WRITE_ENV=true
if [ -f "$PROJECT_ROOT/.env" ]; then
    if [ -t 0 ]; then
        read -r -p "El archivo .env ya existe. ¿Desea sobrescribirlo (se guardará respaldo)? (S/N) [S]: " RESP_ENV || true
        RESP_ENV="${RESP_ENV:-S}"
        if [[ ! "$RESP_ENV" =~ ^[Ss]$ ]]; then
            WRITE_ENV=false
            log_info "Se conserva el archivo .env existente."
        fi
    fi
    if [ "$WRITE_ENV" = true ]; then
        BACKUP_ENV=".env.bak.$(date +%Y%m%d_%H%M%S)"
        cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/$BACKUP_ENV"
        log_warn "Respaldo de .env anterior guardado en: $BACKUP_ENV"
    fi
fi

if [ "$WRITE_ENV" = true ]; then
    cat > "$PROJECT_ROOT/.env" << EOF
# ==============================================================================
# HISCARE - Variables de Entorno de Producción (generado por setup_ubuntu.sh)
# ==============================================================================
DATABASE_URL=${DATABASE_URL_VAL}
SESSION_SECRET=${SESSION_SECRET_VAL}
PORT=${APP_PORT}
NODE_ENV=production
TZ=America/Bogota

DOMINIO_CORREO=hiscare.edu.co
UPLOAD_DIR=uploads/resultados
MAX_UPLOAD_MB=10
ORDEN_VIGENCIA_DIAS=30
LIS_URL=http://127.0.0.1:${APP_PORT}/mock/lis
RIS_URL=http://127.0.0.1:${APP_PORT}/mock/ris
EOF
    log_ok "Archivo .env generado con SESSION_SECRET aleatorio y NODE_ENV=production."
fi

chmod 600 "$PROJECT_ROOT/.env"
mkdir -p "$PROJECT_ROOT/uploads/resultados"
log_ok "Directorio 'uploads/resultados' verificado (permisos .env: 600)."

# ------------------------------------------------------------------------------
# 7. Instalación de dependencias Node.js e inicialización de Base de Datos
# ------------------------------------------------------------------------------
log_step "6/9" "Instalando dependencias (npm install) e inicializando esquema de BD..."

npm install
log_ok "Dependencias de Node.js instaladas."

npm run db:setup
log_ok "Esquema y configuración inicial de base de datos aplicados (npm run db:setup)."

RUN_SEED=false
if [ -t 0 ]; then
    read -r -p "¿Desea cargar datos semilla de demostración/simulación (npm run db:seed)? (s/N) [N]: " RESP_SEED || true
    RESP_SEED="${RESP_SEED:-N}"
    if [[ "$RESP_SEED" =~ ^[Ss]$ ]]; then
        RUN_SEED=true
    fi
fi

if [ "$RUN_SEED" = true ]; then
    log_info "Cargando datos semilla (npm run db:seed)..."
    npm run db:seed
    log_ok "Datos semilla cargados correctamente."
else
    log_info "Carga de datos semilla omitida."
fi

# ------------------------------------------------------------------------------
# 8. Configuración de Nginx como proxy inverso
# ------------------------------------------------------------------------------
log_step "7/9" "Configurando Nginx (/etc/nginx/sites-available/hiscare.conf)..."

NGINX_CONF="/etc/nginx/sites-available/hiscare.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/hiscare.conf"

$SUDO tee "$NGINX_CONF" > /dev/null << EOF
# ==============================================================================
# HISCARE - Configuración de Proxy Inverso Nginx
# Generado automáticamente por deploy/setup_ubuntu.sh
# ==============================================================================
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${NGINX_DOMAINS};

    server_tokens off;
    client_max_body_size 25M;
    client_body_buffer_size 128k;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location = /health {
        proxy_pass http://127.0.0.1:${APP_PORT}/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        access_log off;
    }

    # Nota de seguridad: /uploads/* pasa siempre por Node.js para validar sesión y RBAC
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

$SUDO ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
$SUDO rm -f /etc/nginx/sites-enabled/default

$SUDO nginx -t
$SUDO systemctl reload nginx
log_ok "Nginx configurado, validado con 'nginx -t' y recargado."

# ------------------------------------------------------------------------------
# 9. Configuración del Firewall UFW
# ------------------------------------------------------------------------------
log_step "8/9" "Configurando firewall UFW (OpenSSH y Nginx HTTP)..."

$SUDO ufw allow OpenSSH
$SUDO ufw allow 'Nginx HTTP'
$SUDO ufw --force enable
$SUDO ufw status
log_ok "Firewall UFW activo y configurado."

# ------------------------------------------------------------------------------
# 10. Inicio / Reinicio de la aplicación con PM2
# ------------------------------------------------------------------------------
log_step "9/9" "Iniciando o reiniciando HISCARE en PM2..."

if pm2 describe hiscare >/dev/null 2>&1; then
    pm2 restart hiscare --update-env
    log_ok "Proceso 'hiscare' reiniciado en PM2."
else
    pm2 start npm --name "hiscare" -- start
    log_ok "Proceso 'hiscare' iniciado en PM2."
fi

pm2 save
log_ok "Lista de procesos PM2 guardada."

# Verificación básica de arranque
sleep 2
if curl -fsS "http://127.0.0.1:${APP_PORT}/health" >/dev/null 2>&1; then
    log_ok "Healthcheck exitoso en http://127.0.0.1:${APP_PORT}/health"
else
    log_warn "El servicio aún está iniciando o /health no respondió de inmediato. Revise con: pm2 logs hiscare"
fi

echo -e "\n${CLR_GREEN}${CLR_BOLD}================================================================================"
echo -e "  ✔ DESPLIEGUE DE HISCARE COMPLETADO EN UBUNTU SERVER"
echo -e "================================================================================${CLR_RESET}"
echo -e "  • Dominios Nginx : ${CLR_CYAN}${NGINX_DOMAINS}${CLR_RESET}"
echo -e "  • Puerto App     : ${CLR_CYAN}127.0.0.1:${APP_PORT}${CLR_RESET}"
echo -e "  • Base de Datos  : ${CLR_CYAN}${DB_NAME} (usuario: postgres)${CLR_RESET}"
echo -e "  • Estado PM2     : ${CLR_YELLOW}pm2 status${CLR_RESET}"
echo -e "  • Logs en vivo   : ${CLR_YELLOW}pm2 logs hiscare${CLR_RESET}"
echo -e "  • Autoarranque   : Ejecute ${CLR_YELLOW}pm2 startup${CLR_RESET} y siga la instrucción generada si desea inicio automático tras reinicio."
echo ""
