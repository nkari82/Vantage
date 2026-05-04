#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./install-vantage.sh [PROJECT_SRC] [options]

Arguments:
  PROJECT_SRC              Source directory to deploy (default: current directory)

Options:
  --help, -h               Show this help
  --dry-run                Print commands without executing
  --skip-build             Skip npm install/build steps
  --target-dir <path>      Install target directory (default: /opt/vantage)
  --service-user <name>    Service user (default: vantage)
  --with-steam-streaming   Install Steam + Sunshine + helper scripts for remote streaming

Examples:
  ./install-vantage.sh
  ./install-vantage.sh /path/to/vantage
  ./install-vantage.sh --dry-run
  ./install-vantage.sh /path/to/vantage --skip-build
  ./install-vantage.sh --with-steam-streaming
EOF
}

PROJECT_SRC=""
TARGET_DIR="/opt/vantage"
SERVICE_USER="vantage"
ADMIN_ENV_DIR="/etc/vantage"
ADMIN_ENV_FILE="/etc/vantage/backend.env"
STEAM_ENV_FILE="/etc/default/vantage-steam"
STEAM_START_HELPER="/usr/local/bin/vantage-steam-session-start"
STEAM_END_HELPER="/usr/local/bin/vantage-steam-session-end"
DRY_RUN=false
SKIP_BUILD=false
WITH_STEAM_STREAMING=false

SERVICES=(
  "vantage-backend.service"
  "vantage-ak620-agent.service"
  "vllm-coder.service"
  "vantage-llm-gateway.service"
  "vantage-adaptive-engine.service"
  "vantage-system-agent.service"
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --target-dir)
      TARGET_DIR="$2"
      shift 2
      ;;
    --service-user)
      SERVICE_USER="$2"
      shift 2
      ;;
    --with-steam-streaming)
      WITH_STEAM_STREAMING=true
      shift
      ;;
    --*)
      echo "[ERROR] Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      if [[ -z "$PROJECT_SRC" ]]; then
        PROJECT_SRC="$1"
        shift
      else
        echo "[ERROR] Unexpected argument: $1" >&2
        usage
        exit 1
      fi
      ;;
  esac
done

PROJECT_SRC="${PROJECT_SRC:-$(pwd)}"

if [[ ! -d "$PROJECT_SRC" ]]; then
  echo "[ERROR] Project source directory not found: $PROJECT_SRC" >&2
  exit 1
fi

if [[ "$EUID" -eq 0 ]]; then
  AS_ROOT=()
  RUN_AS_USER_MODE="root"
else
  if ! command -v sudo >/dev/null 2>&1; then
    echo "[ERROR] Root privileges are required for system install. Run as root or install sudo." >&2
    exit 1
  fi
  AS_ROOT=(sudo)
  RUN_AS_USER_MODE="sudo"
fi

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[ERROR] Required command not found: $cmd" >&2
    exit 1
  fi
}

read_env_value() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    return 0
  fi

  grep "^${key}=" "$file" 2>/dev/null | tail -n1 | cut -d= -f2-
}

generate_admin_password() {
  od -An -N18 -tx1 /dev/urandom | tr -d ' \n'
}

generate_password_hash() {
  local password="$1"
  ADMIN_PASSWORD="$password" node <<'EOF'
const crypto = require("node:crypto");
const password = process.env.ADMIN_PASSWORD ?? "";
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
process.stdout.write("scrypt$" + salt.toString("hex") + "$" + hash.toString("hex"));
EOF
}

run_cmd() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '[DRY-RUN]'
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
  else
    "$@"
  fi
}

run_as_root() {
  run_cmd "${AS_ROOT[@]}" "$@"
}

run_as_service_user() {
  if [[ "$DRY_RUN" == "true" ]]; then
    if [[ "$RUN_AS_USER_MODE" == "root" ]]; then
      printf '[DRY-RUN] runuser -u %q -- bash -lc %q\n' "$SERVICE_USER" "$*"
    else
      printf '[DRY-RUN] sudo -u %q bash -lc %q\n' "$SERVICE_USER" "$*"
    fi
    return
  fi

  if [[ "$RUN_AS_USER_MODE" == "root" ]]; then
    runuser -u "$SERVICE_USER" -- bash -lc "$*"
  else
    sudo -u "$SERVICE_USER" bash -lc "$*"
  fi
}

build_node_project_if_present() {
  local project_dir="$1"
  local label="$2"

  if [[ ! -d "$project_dir" ]]; then
    echo "[SKIP] $label directory missing: $project_dir"
    return
  fi

  if [[ ! -f "$project_dir/package.json" ]]; then
    echo "[SKIP] $label has no package.json: $project_dir"
    return
  fi

  if [[ "$SKIP_BUILD" == "true" ]]; then
    echo "[SKIP] $label build skipped by --skip-build"
    return
  fi

  echo "[BUILD] $label"
  run_as_service_user "
    cd '$project_dir'
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
    npm run build --if-present
  "
}

install_steam_streaming_stack() {
  local system_token="$1"

  echo "[steam] Install Steam/Sunshine dependencies"
  run_as_root apt update
  run_as_root apt install -y curl jq ufw software-properties-common steam-installer sunshine xorg xserver-xorg-video-dummy mesa-utils

  echo "[steam] Enable Sunshine"
  run_as_root systemctl enable sunshine
  run_as_root systemctl restart sunshine
  run_as_root systemctl --no-pager --full status sunshine || true

  echo "[steam] Configure firewall for Sunshine"
  run_as_root ufw allow OpenSSH || true
  for p in 47984/tcp 47989/tcp 47990/tcp 48010/tcp 47998/udp 47999/udp 48000/udp 48002/udp 48010/udp; do
    run_as_root ufw allow "$p" || true
  done
  run_as_root ufw --force enable || true
  run_as_root ufw status || true

  echo "[steam] Write streaming helper env"
  run_as_root tee "$STEAM_ENV_FILE" >/dev/null <<EOF
VANTAGE_HOST=http://127.0.0.1:18080
VANTAGE_TOKEN=${system_token}
EOF
  run_as_root chown root:"${SERVICE_USER}" "$STEAM_ENV_FILE"
  run_as_root chmod 0640 "$STEAM_ENV_FILE"

  echo "[steam] Install session helper commands"
  run_as_root tee "$STEAM_START_HELPER" >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source /etc/default/vantage-steam
if [[ -z "${VANTAGE_TOKEN:-}" ]]; then
  echo "VANTAGE_TOKEN is not configured in /etc/default/vantage-steam" >&2
  exit 1
fi
curl -fsS -X POST "${VANTAGE_HOST}/api/steam/session/start" \
  -H "Authorization: Bearer ${VANTAGE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{}"
echo
EOF
  run_as_root tee "$STEAM_END_HELPER" >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source /etc/default/vantage-steam
if [[ -z "${VANTAGE_TOKEN:-}" ]]; then
  echo "VANTAGE_TOKEN is not configured in /etc/default/vantage-steam" >&2
  exit 1
fi
curl -fsS -X POST "${VANTAGE_HOST}/api/steam/session/end" \
  -H "Authorization: Bearer ${VANTAGE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{}"
echo
EOF
  run_as_root chmod 0755 "$STEAM_START_HELPER" "$STEAM_END_HELPER"
}

echo "[0/11] Preflight checks"
require_cmd rsync
require_cmd systemctl
require_cmd bash
require_cmd node
if [[ "$RUN_AS_USER_MODE" == "root" ]]; then
  require_cmd runuser
fi
if [[ "$SKIP_BUILD" != "true" ]]; then
  require_cmd npm
fi
if [[ "$WITH_STEAM_STREAMING" == "true" ]]; then
  require_cmd apt
fi

echo "[INFO] SOURCE=$PROJECT_SRC"
echo "[INFO] TARGET=$TARGET_DIR"
echo "[INFO] SERVICE_USER=$SERVICE_USER"
echo "[INFO] DRY_RUN=$DRY_RUN"
echo "[INFO] SKIP_BUILD=$SKIP_BUILD"
echo "[INFO] WITH_STEAM_STREAMING=$WITH_STEAM_STREAMING"

echo "[1/11] Copy project -> ${TARGET_DIR}"
run_as_root mkdir -p "${TARGET_DIR}"
run_as_root rsync -av --delete "${PROJECT_SRC}/" "${TARGET_DIR}/"

echo "[2/11] Create service user"
run_as_root useradd -r -s /bin/false "${SERVICE_USER}" 2>/dev/null || true
run_as_root chown -R "${SERVICE_USER}:${SERVICE_USER}" "${TARGET_DIR}"

echo "[3/11] Build app (server + dashboard)"
build_node_project_if_present "${TARGET_DIR}/app" "app"

echo "[4/11] Build AK620 agent (npm auto)"
build_node_project_if_present "${TARGET_DIR}/services/ak620-agent" "ak620-agent"

echo "[5/11] Build LLM gateway (npm auto)"
build_node_project_if_present "${TARGET_DIR}/services/llm-gateway" "llm-gateway"

echo "[6/11] Build adaptive-engine (npm auto)"
build_node_project_if_present "${TARGET_DIR}/services/adaptive-engine" "adaptive-engine"

echo "[7/11] Build system-agent (npm auto)"
build_node_project_if_present "${TARGET_DIR}/services/system-agent" "system-agent"

run_as_root tee /etc/sudoers.d/vantage-system <<EOF
vantage ALL=(root) NOPASSWD: /bin/systemctl reboot
vantage ALL=(root) NOPASSWD: /bin/systemctl poweroff
vantage ALL=(root) NOPASSWD: /bin/systemctl halt
vantage ALL=(root) NOPASSWD: /bin/systemctl start vllm-coder.service
vantage ALL=(root) NOPASSWD: /bin/systemctl stop vllm-coder.service
EOF
run_as_root chmod 0440 /etc/sudoers.d/vantage-system

run_as_root mkdir -p "$ADMIN_ENV_DIR"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD=""
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] create $ADMIN_ENV_FILE with generated system/gateway/admin credentials if missing"
  SYSTEM_TOKEN="DRY_RUN_TOKEN"
  GATEWAY_TOKEN="DRY_RUN_GATEWAY_TOKEN"
  ADMIN_PASSWORD="DRY_RUN_ADMIN_PASSWORD"
  ADMIN_PASSWORD_HASH='scrypt$dryrun$dryrun'
else
  EXISTING_SYSTEM_TOKEN="$(read_env_value "VANTAGE_SYSTEM_TOKEN" "$ADMIN_ENV_FILE")"
  EXISTING_GATEWAY_TOKEN="$(read_env_value "VANTAGE_LLM_GATEWAY_TOKEN" "$ADMIN_ENV_FILE")"
  EXISTING_ADMIN_USERNAME="$(read_env_value "VANTAGE_ADMIN_USERNAME" "$ADMIN_ENV_FILE")"
  EXISTING_ADMIN_PASSWORD_HASH="$(read_env_value "VANTAGE_ADMIN_PASSWORD_HASH" "$ADMIN_ENV_FILE")"
  SYSTEM_TOKEN="${EXISTING_SYSTEM_TOKEN:-$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')}"
  GATEWAY_TOKEN="${EXISTING_GATEWAY_TOKEN:-$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')}"
  ADMIN_USERNAME="${EXISTING_ADMIN_USERNAME:-admin}"
  if [[ -n "$EXISTING_ADMIN_PASSWORD_HASH" ]]; then
    ADMIN_PASSWORD_HASH="$EXISTING_ADMIN_PASSWORD_HASH"
  else
    ADMIN_PASSWORD="$(generate_admin_password)"
    ADMIN_PASSWORD_HASH="$(generate_password_hash "$ADMIN_PASSWORD")"
  fi
  printf 'VANTAGE_SYSTEM_TOKEN=%s\nVANTAGE_LLM_GATEWAY_TOKEN=%s\nVANTAGE_ADMIN_USERNAME=%s\nVANTAGE_ADMIN_PASSWORD_HASH=%s\n' "$SYSTEM_TOKEN" "$GATEWAY_TOKEN" "$ADMIN_USERNAME" "$ADMIN_PASSWORD_HASH" | "${AS_ROOT[@]}" tee "$ADMIN_ENV_FILE" >/dev/null
fi
run_as_root chown "root:${SERVICE_USER}" "$ADMIN_ENV_FILE"
run_as_root chmod 0640 "$ADMIN_ENV_FILE"

if [[ "$WITH_STEAM_STREAMING" == "true" ]]; then
  echo "[8/11] Install Steam streaming stack"
  install_steam_streaming_stack "$SYSTEM_TOKEN"
else
  echo "[8/11] Steam streaming stack skipped"
fi

echo "[9/11] Ensure executable scripts"
run_as_root chmod +x "${TARGET_DIR}/scripts/"*.sh

echo "[10/11] Install systemd units"
for svc in "${SERVICES[@]}"; do
  run_as_root cp "${TARGET_DIR}/services/linux/${svc}" "/etc/systemd/system/${svc}"
done
run_as_root systemctl daemon-reload

echo "[11/11] Enable + restart all core services"
for svc in "${SERVICES[@]}"; do
  run_as_root systemctl enable "$svc"
  run_as_root systemctl restart "$svc"
  run_as_root systemctl --no-pager --full status "$svc"
done

echo "Installation complete. Reboot-safe always-on services are enabled."
echo "Admin token file: ${ADMIN_ENV_FILE}"
echo "Admin username: ${ADMIN_USERNAME}"
if [[ -n "$ADMIN_PASSWORD" ]]; then
  echo "Admin password (save now): ${ADMIN_PASSWORD}"
else
  echo "Admin password: preserved existing value"
fi
if [[ "$WITH_STEAM_STREAMING" == "true" ]]; then
  echo "Steam helper env: ${STEAM_ENV_FILE}"
  echo "Steam session start helper: ${STEAM_START_HELPER}"
  echo "Steam session end helper: ${STEAM_END_HELPER}"
  echo "Sunshine Web UI: https://<server-ip>:47990"
fi
