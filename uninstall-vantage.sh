#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="/opt/vantage"
SERVICE_USER="vantage"
STEAM_ENV_FILE="/etc/default/vantage-steam"
STEAM_START_HELPER="/usr/local/bin/vantage-steam-session-start"
STEAM_END_HELPER="/usr/local/bin/vantage-steam-session-end"

SERVICES=(
  "vantage-backend.service"
  "vantage-ak620-agent.service"
  "vllm-coder.service"
  "vantage-llm-gateway.service"
  "vantage-adaptive-engine.service"
  "vantage-system-agent.service"
)

echo "[1/5] Stop and disable services"
for svc in "${SERVICES[@]}"; do
  sudo systemctl stop "$svc" || true
  sudo systemctl disable "$svc" || true
  sudo rm -f "/etc/systemd/system/$svc"
done
sudo systemctl daemon-reload

echo "[2/5] Remove application files"
sudo rm -rf "$TARGET_DIR"

echo "[3/5] Remove sudoers file"
sudo rm -f /etc/sudoers.d/vantage-system

echo "[4/5] Remove Steam streaming helpers"
sudo rm -f "$STEAM_ENV_FILE" "$STEAM_START_HELPER" "$STEAM_END_HELPER"

echo "[5/5] Remove service user"
sudo userdel -r "$SERVICE_USER" 2>/dev/null || true

echo "Uninstallation complete."
