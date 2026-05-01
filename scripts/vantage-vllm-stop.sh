#!/usr/bin/env bash
set -euo pipefail

# Stop process by service first if available
if command -v systemctl >/dev/null 2>&1; then
  systemctl stop vllm-coder.service 2>/dev/null || true
fi

# Fallback: kill direct vllm serve process
pkill -f "vllm serve Lorbus/Qwen3.6-27B-int4-AutoRound" 2>/dev/null || true

echo "[vantage-vllm-stop] requested"
