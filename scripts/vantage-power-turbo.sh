#!/usr/bin/env bash
set -euo pipefail

if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi -pm 1 || true
  nvidia-smi -pl 350 || true
fi

if compgen -G "/sys/devices/system/cpu/cpu*/cpufreq/scaling_governor" > /dev/null; then
  for gov in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
    echo performance | tee "${gov}" >/dev/null || true
  done
fi

echo "[vantage-power-turbo] applied"
