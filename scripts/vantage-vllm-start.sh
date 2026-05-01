#!/usr/bin/env bash
set -euo pipefail

export CUDA_VISIBLE_DEVICES=0,1
export VLLM_USE_FLASHINFER_SAMPLER=1
export VLLM_ENABLE_CUDAGRAPH_GC=1

exec vllm serve Lorbus/Qwen3.6-27B-int4-AutoRound \
  --served-model-name qwen3.6-27b-local \
  --quantization auto_round \
  --tensor-parallel-size 2 \
  --max-model-len 65536 \
  --max-num-seqs 4 \
  --max-num-batched-tokens 8192 \
  --gpu-memory-utilization 0.88 \
  --kv-cache-dtype fp8 \
  --enable-prefix-caching \
  --enable-chunked-prefill \
  --attention-backend flashinfer \
  --speculative-config '{"method":"mtp","num_speculative_tokens":3}' \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder \
  --reasoning-parser qwen3 \
  --port 8000 \
  -O3
