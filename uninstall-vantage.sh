#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="/opt/vantage"
SERVICE_USER="vantage"

SERVICES=(
  "vantage-backend.service"
  "vantage-dashboard.service"
  "vantage-ak620-agent.service"
  "vllm-coder.service"
  "vantage-llm-gateway.service"
  "vantage-adaptive-engine.service"
  "vantage-system-agent.service"
)

echo "[1/4] Stop and disable services"
for svc in "${SERVICES[@]}"; do
  sudo systemctl stop "$svc" || true
  sudo systemctl disable "$svc" || true
  sudo rm -f "/etc/systemd/system/$svc"
done
sudo systemctl daemon-reload

echo "[2/4] Remove application files"
sudo rm -rf "$TARGET_DIR"

echo "[3/4] Remove sudoers file"
sudo rm -f /etc/sudoers.d/vantage-system

echo "[4/4] Remove service user"
sudo userdel -r "$SERVICE_USER" 2>/dev/null || true

echo "Uninstallation complete."
