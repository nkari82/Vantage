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

Examples:
  ./install-vantage.sh
  ./install-vantage.sh /path/to/vantage
  ./install-vantage.sh --dry-run
  ./install-vantage.sh /path/to/vantage --skip-build
EOF
}

PROJECT_SRC=""
TARGET_DIR="/opt/vantage"
SERVICE_USER="vantage"
ADMIN_ENV_DIR="/etc/vantage"
ADMIN_ENV_FILE="/etc/vantage/backend.env"
DRY_RUN=false
SKIP_BUILD=false

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

echo "[0/10] Preflight checks"
require_cmd rsync
require_cmd systemctl
require_cmd bash
if [[ "$RUN_AS_USER_MODE" == "root" ]]; then
  require_cmd runuser
fi
if [[ "$SKIP_BUILD" != "true" ]]; then
  require_cmd npm
fi

echo "[INFO] SOURCE=$PROJECT_SRC"
echo "[INFO] TARGET=$TARGET_DIR"
echo "[INFO] SERVICE_USER=$SERVICE_USER"
echo "[INFO] DRY_RUN=$DRY_RUN"
echo "[INFO] SKIP_BUILD=$SKIP_BUILD"

echo "[1/11] Copy project -> ${TARGET_DIR}"
run_as_root mkdir -p "${TARGET_DIR}"
run_as_root rsync -av --delete "${PROJECT_SRC}/" "${TARGET_DIR}/"

echo "[2/11] Create service user"
run_as_root useradd -r -s /bin/false "${SERVICE_USER}" 2>/dev/null || true
run_as_root chown -R "${SERVICE_USER}:${SERVICE_USER}" "${TARGET_DIR}"

echo "[3/11] Build app (server + dashboard)"
build_node_project_if_present "${TARGET_DIR}/app" "app"

echo "[4/10] Build AK620 agent (npm auto)"
build_node_project_if_present "${TARGET_DIR}/services/ak620-agent" "ak620-agent"

echo "[5/10] Build LLM gateway (npm auto)"
build_node_project_if_present "${TARGET_DIR}/services/llm-gateway" "llm-gateway"

echo "[6/10] Build adaptive-engine (npm auto)"
build_node_project_if_present "${TARGET_DIR}/services/adaptive-engine" "adaptive-engine"

echo "[7/10] Build system-agent (npm auto)"
build_node_project_if_present "${TARGET_DIR}/services/system-agent" "system-agent"

# sudoers 권한 추가 (vantage 유저에게 시스템 제어 권한 부여)
run_as_root tee /etc/sudoers.d/vantage-system <<EOF
vantage ALL=(root) NOPASSWD: /bin/systemctl reboot
vantage ALL=(root) NOPASSWD: /bin/systemctl poweroff
vantage ALL=(root) NOPASSWD: /bin/systemctl halt
EOF
run_as_root chmod 0440 /etc/sudoers.d/vantage-system

# System token and LLM gateway token for privileged backend API calls.
run_as_root mkdir -p "$ADMIN_ENV_DIR"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] create $ADMIN_ENV_FILE with VANTAGE_SYSTEM_TOKEN / VANTAGE_LLM_GATEWAY_TOKEN if missing"
else
  EXISTING_SYSTEM_TOKEN="$(run_as_root sh -c "grep '^VANTAGE_SYSTEM_TOKEN=' '$ADMIN_ENV_FILE' 2>/dev/null | tail -n1 | cut -d= -f2-")"
  EXISTING_GATEWAY_TOKEN="$(run_as_root sh -c "grep '^VANTAGE_LLM_GATEWAY_TOKEN=' '$ADMIN_ENV_FILE' 2>/dev/null | tail -n1 | cut -d= -f2-")"
  SYSTEM_TOKEN="${EXISTING_SYSTEM_TOKEN:-$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')}"
  GATEWAY_TOKEN="${EXISTING_GATEWAY_TOKEN:-$SYSTEM_TOKEN}"
  printf 'VANTAGE_SYSTEM_TOKEN=%s\nVANTAGE_LLM_GATEWAY_TOKEN=%s\n' "$SYSTEM_TOKEN" "$GATEWAY_TOKEN" | "${AS_ROOT[@]}" tee "$ADMIN_ENV_FILE" >/dev/null
fi
run_as_root chown "root:${SERVICE_USER}" "$ADMIN_ENV_FILE"
run_as_root chmod 0640 "$ADMIN_ENV_FILE"

echo "[8/10] Ensure executable scripts"
run_as_root chmod +x "${TARGET_DIR}/scripts/"*.sh

echo "[9/10] Install systemd units"
run_as_root cp "${TARGET_DIR}/systemd/"*.service /etc/systemd/system/
run_as_root systemctl daemon-reload

echo "[10/10] Enable + restart all core services"
for svc in "${SERVICES[@]}"; do
  run_as_root systemctl enable "$svc"
  run_as_root systemctl restart "$svc"
  run_as_root systemctl --no-pager --full status "$svc"
done

echo "Installation complete. Reboot-safe always-on services are enabled."
echo "Admin token file: ${ADMIN_ENV_FILE}"
