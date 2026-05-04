#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${VANTAGE_VLLM_COMPOSE_FILE:-/opt/vantage/services/vllm-container/docker-compose.yml}"
DOCKER_BIN="${VANTAGE_DOCKER_BIN:-docker}"

exec "$DOCKER_BIN" compose -f "$COMPOSE_FILE" up
