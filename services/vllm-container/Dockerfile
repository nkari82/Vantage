# vLLM official image is recommended
FROM vllm/vllm-openai:latest

# Set environment variables for better performance
ENV VLLM_USE_FLASHINFER_SAMPLER=1
ENV VLLM_ENABLE_CUDAGRAPH_GC=1

# Expose the API port
EXPOSE 8000

# Entrypoint is handled by vllm serve in the script/compose
