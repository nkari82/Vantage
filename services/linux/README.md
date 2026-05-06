# Linux service runtime assets

이 디렉터리는 Windows `services/windows/*.ps1`와 대응되는 Linux systemd 서비스 유닛 파일을 보관합니다.

기준:
- 논리 서비스 1개당 Linux systemd 유닛 파일 1개
- 실제 서비스 등록은 루트 `install-vantage.sh`가 담당
- systemd는 각 `.service` 파일의 `ExecStart`/`EnvironmentFile` 설정을 사용해 실제 런타임 엔트리를 시작합니다.

포함 자산:
- `vantage-backend.service`
- `vantage-llm-gateway.service`
- `vllm-coder.service`
- `vantage-ak620-agent.service`
- `vantage-adaptive-engine.service`
- `vantage-system-agent.service`
