# Windows service runtime assets

이 디렉터리는 Linux `services/linux/*.service`와 대응되는 Windows NSSM 서비스 진입 스크립트를 보관합니다.

기준:
- 논리 서비스 1개당 Windows 진입 스크립트 1개
- 실제 서비스 등록은 루트 `install-vantage.ps1`가 담당
- NSSM은 각 `.ps1` 파일을 실행하고, 각 스크립트는 환경변수(`VANTAGE_INSTALL_ROOT`, `VANTAGE_NODE_EXE`, `VANTAGE_VLLM_COMPOSE_FILE` 등)를 사용해 실제 런타임 엔트리를 시작합니다.

포함 자산:
- `vantage-backend.ps1`
- `vantage-llm-gateway.ps1`
- `vllm-coder.ps1`
- `vantage-ak620-agent.ps1`
- `vantage-adaptive-engine.ps1`
- `vantage-system-agent.ps1`
