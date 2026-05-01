#!/usr/bin/env bash
set -euo pipefail

GPU_LIMIT_W="${1:-60}"

# GPU persistent mode + low power limit (50~70W recommended)
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi -pm 1 || true
  nvidia-smi -pl "${GPU_LIMIT_W}" || true
fi

# CPU governor powersave
if compgen -G "/sys/devices/system/cpu/cpu*/cpufreq/scaling_governor" > /dev/null; then
  for gov in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
    echo powersave | tee "${gov}" >/dev/null || true
  done
fi

# Optional low-power services
for svc in cron apt-daily.service apt-daily-upgrade.service; do
  systemctl stop "${svc}" 2>/dev/null || true
done

# NVMe APST (best effort)
if [ -f /sys/module/nvme_core/parameters/default_ps_max_latency_us ]; then
  echo 5500 | tee /sys/module/nvme_core/parameters/default_ps_max_latency_us >/dev/null || true
fi

echo "[vantage-power-low] applied with GPU ${GPU_LIMIT_W}W"
