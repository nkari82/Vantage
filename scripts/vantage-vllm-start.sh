#!/usr/bin/env bash
set -euo pipefail

cd /opt/vantage/services/vllm-container
docker compose up -d
