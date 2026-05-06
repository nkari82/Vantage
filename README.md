# Vantage 프로젝트 설치 및 배포 가이드

본 문서는 우분투 서버 환경에서 Vantage 프로젝트를 설치하고, Docker 및 vLLM 기반의 서비스 환경을 구축하는 방법을 안내합니다.

## 프로젝트 개요
Vantage는 듀얼 RTX 3090 기반 로컬 AI 서버를 위한 시스템 운용 플랫폼입니다. 시스템 상태 모니터링, GPU 전력 모드 제어, LLM Gateway 자동 관리(vLLM 기동/종료), 그리고 AK620 Digital 디스플레이 연동을 통합 웹 대시보드에서 관리합니다. 듀얼 RTX 3090 서버를 저전력 홈서버와 고성능 LLM 서버 사이에서 자동 전환하며 전력을 최적화합니다.

### 주요 기능
- **전력 모드 제어**: DEFAULT, LOW_POWER, STANDARD_250, STANDARD_280, ADAPTIVE 모드 지원
- **LLM Gateway 관리**: vLLM 자동 시작/종료, 유휴 타임아웃 설정
- **시스템 모니터링**: GPU 온도/전력/이용률, CPU 패키지 전력(RAPL), 시스템 전력 추정
- **AK620 Digital 연동**: 온도 표시, BAR 레벨 제어, 새로고침 간격 설정 (상태 파일 IPC)
- **스트레스 테스트**: CPU/RAM 스트레스 테스트 (stress-ng 기반, Linux/Windows 지원, fire-and-forget 패턴)
- **Memtest86 재부팅**: Linux GRUB 기반 Memtest86 자동 부팅 (1회성)
- **로그 뷰어**: backend, llm-gateway, vllm-coder, ak620-agent, adaptive-engine, system-agent 로그 조회
- **대시보드**: React + TypeScript + Vite 기반 SPA, 백엔드와 동일 포트(18080) 제공

## 프로젝트 구조
```
Vantage/
├── app/
├── services/
│   ├── ak620-agent/
│   ├── llm-gateway/
│   ├── system-agent/
│   ├── adaptive-engine/
│   ├── vllm-container/
│   ├── linux/        # Linux runtime assets (.service per logical service)
│   ├── windows/      # Windows runtime assets (.ps1 per logical service)
│   └── common/
├── install-vantage.sh
├── install-vantage.ps1
├── uninstall-vantage.sh
├── uninstall-vantage.ps1
└── README.md
```

## 5. 루트 기준 빌드 및 로컬 실행
```bash
cd D:\Work\Vantage
npm run build
npm run start
```

### Windows 실행 참고
- Windows에서는 systemd 대신 NSSM 기반 Windows 서비스(`VantageBackend`, `VantageLlmGateway`, `VllmCoder`, `VantageAk620Agent`, `VantageAdaptiveEngine`, `VantageSystemAgent`)를 사용합니다.
- `services/windows/`는 Linux `services/linux/*.service`와 대응되도록, 논리 서비스별 PowerShell 진입 스크립트를 포함합니다.
- `vantage-dashboard.service` / `VantageDashboard`는 더 이상 배포 대상이 아니며, 대시보드는 backend가 `app/dist/client`를 직접 서빙합니다.
- GPU/전력 정보는 NVIDIA 드라이버 및 `nvidia-smi` 동작 여부에 따라 표시됩니다.
- Windows 로그 API(`/api/logs`)는 `C:\opt\vantage\logs\*.log` 파일을 읽습니다.
- `VllmCoder`는 Windows에서 `docker compose -f C:\opt\vantage\services\vllm-container\docker-compose.yml up` 형태로 동작하도록 설치됩니다.

### Windows 자동 설치 / 제거
```powershell
pwsh -ExecutionPolicy Bypass -File .\install-vantage.ps1
pwsh -ExecutionPolicy Bypass -File .\install-vantage.ps1 -WithSteamStreaming
pwsh -ExecutionPolicy Bypass -File .\uninstall-vantage.ps1
```

- 기본 설치 경로: `C:\opt\vantage`
- 필수 사전조건: Node.js, npm, NSSM, Docker Desktop(또는 docker CLI), 관리자 권한 PowerShell
- `-WithSteamStreaming` 사용 시 `C:\opt\vantage\helpers\vantage-steam-session-start.ps1`, `...end.ps1` helper와 Sunshine 방화벽 규칙을 생성합니다.
- Sunshine/Steam 설치파일은 보안상 자동 실행하지 않습니다. 설치기는 공식 다운로드 URL만 안내하므로, 두 프로그램은 관리자 권한으로 수동 설치하세요.
- 설치 완료 시 생성된 `Admin username` / `Admin password`를 반드시 별도 저장하세요. 비밀번호 평문은 설치 직후 요약에만 출력됩니다.
- Sunshine Web UI 기본 주소: `https://localhost:47990`

## 6. 전체 자동 설치 (권장)
### Linux / Ubuntu
```bash
sudo ./install-vantage.sh
sudo ./install-vantage.sh --with-steam-streaming
```

Linux 설치 스크립트는 다음 자산을 배포합니다.
- systemd unit: `vantage-backend.service`, `vantage-ak620-agent.service`, `vllm-coder.service`, `vantage-llm-gateway.service`, `vantage-adaptive-engine.service`, `vantage-system-agent.service`
- backend env: `/etc/vantage/backend.env`

Windows 설치 스크립트는 다음 자산을 배포합니다.
- NSSM service entry script: `services/windows/vantage-backend.ps1`, `services/windows/vantage-llm-gateway.ps1`, `services/windows/vllm-coder.ps1`, `services/windows/vantage-ak620-agent.ps1`, `services/windows/vantage-adaptive-engine.ps1`, `services/windows/vantage-system-agent.ps1`
- backend env: `C:\opt\vantage\env\backend.env`

### Windows
```powershell
pwsh -ExecutionPolicy Bypass -File .\install-vantage.ps1
pwsh -ExecutionPolicy Bypass -File .\install-vantage.ps1 -WithSteamStreaming
```

## 7. 프로젝트 삭제 (Uninstall)
### Linux / Ubuntu
```bash
sudo ./uninstall-vantage.sh
```

### Windows
```powershell
pwsh -ExecutionPolicy Bypass -File .\uninstall-vantage.ps1
```

## 8. 검증
### Linux / Ubuntu
```bash
systemctl status vantage-backend
systemctl status vantage-llm-gateway
systemctl status vllm-coder
systemctl status vantage-ak620-agent
systemctl status vantage-adaptive-engine
systemctl status vantage-system-agent
```

### Windows
```powershell
Get-Service VantageBackend,VantageLlmGateway,VllmCoder,VantageAk620Agent,VantageAdaptiveEngine,VantageSystemAgent

Invoke-RestMethod -Method Post -Uri http://localhost:18080/api/system/test/cpu `
  -Headers @{ Authorization = "Bearer $env:VANTAGE_SYSTEM_TOKEN" } `
  -ContentType "application/json" `
  -Body '{"durationSeconds":60}'

Invoke-RestMethod -Method Get -Uri http://localhost:18080/api/system/test/status `
  -Headers @{ Authorization = "Bearer $env:VANTAGE_SYSTEM_TOKEN" }
```

## 9. 토큰 / 보안 운영
`/etc/vantage/backend.env` 또는 `C:\opt\vantage\env\backend.env`에는 다음 값이 들어갑니다.
- `VANTAGE_SYSTEM_TOKEN`
- `VANTAGE_LLM_GATEWAY_TOKEN`
- `VANTAGE_ADMIN_USERNAME`
- `VANTAGE_ADMIN_PASSWORD_HASH`
- `VANTAGE_VLLM_COMPOSE_FILE` (플랫폼별 vLLM compose 경로; Linux `vllm-coder.service`와 Windows `VllmCoder`가 직접 사용)

로그인은 `VANTAGE_ADMIN_USERNAME`과 설치 시 출력된 관리자 비밀번호를 사용합니다.

## 10. 운영 검증 예시
```bash
curl -X POST http://<서버IP>:18080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<VANTAGE_ADMIN_USERNAME>","password":"<설치 시 출력된 관리자 비밀번호>"}'

curl -X POST http://<서버IP>:18080/api/llm/touch \
  -H "Authorization: Bearer $VANTAGE_SYSTEM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 11. sudo 권한 설정 (Linux)
```bash
sudo visudo
# 아래 내용 추가:
vantage ALL=(root) NOPASSWD: /bin/systemctl reboot
vantage ALL=(root) NOPASSWD: /bin/systemctl poweroff
vantage ALL=(root) NOPASSWD: /bin/systemctl start vllm-coder.service
vantage ALL=(root) NOPASSWD: /bin/systemctl stop vllm-coder.service
vantage ALL=(root) NOPASSWD: /usr/bin/stress-ng
vantage ALL=(root) NOPASSWD: /usr/bin/grub-reboot
```

## 12. 랜 케이블 직결(Host ↔ PC) 설정 가이드
직결 NIC 기능은 **호스트(Vantage 서버)와 클라이언트 PC를 전용 랜 케이블로 1:1 연결**해서,
게임/스트리밍 트래픽을 일반 공유기망과 분리할 때 사용합니다.

### 12.1 공통 준비
1. 호스트와 PC를 이더넷 케이블로 직접 연결합니다.
2. 양쪽 NIC가 링크 업(LED 점등) 상태인지 확인합니다.
3. IP 대역을 정합니다. (예: 호스트 `10.77.0.1`, PC `10.77.0.2`, 마스크 `255.255.255.0`)
4. Vantage 대시보드 `Settings > Dedicated NIC (Direct Link)`에서 다음 값을 입력합니다.
   - `Enable direct PC link`: ON
   - `NIC Name`: 직결에 사용할 NIC 이름 (예: `Ethernet 2`, `enp6s0`)
   - `Host Local IP`: 예) `10.77.0.1`
   - `Peer PC IP`: 예) `10.77.0.2`
   - `Subnet Mask`: 예) `255.255.255.0`
   - `MTU`: 기본 `9000` (양쪽 NIC가 jumbo frame 미지원이면 `1500` 권장)
   - 필요 시 `Auto apply on save`: ON
5. 저장 후 `Apply Direct Link Now`를 눌러 즉시 적용합니다.

> 참고: `Detected Candidate NICs` 목록에서 NIC를 클릭하면 `NIC Name`에 자동 반영됩니다.

### 12.2 호스트가 Windows인 경우
호스트(Vantage)가 Windows라면, 적용 시 내부적으로 `netsh`를 사용해 NIC에 정적 IP/MTU를 설정합니다.

#### A) 대시보드로 적용 (권장)
- 위 공통 절차대로 저장 + `Apply Direct Link Now` 실행

#### B) Windows에서 수동 확인
PowerShell(관리자)에서 NIC 상태/IP 확인:
```powershell
Get-NetAdapter | Select-Object Name, Status, LinkSpeed, MacAddress
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress, PrefixLength
```

PC 쪽에서 호스트 직결 IP 핑 테스트:
```powershell
ping 10.77.0.1
```

### 12.3 호스트가 Linux인 경우
호스트(Vantage)가 Linux라면, 적용 시 내부적으로 `ip` 명령(`ip link`, `ip addr replace`)으로 정적 IP/MTU를 설정합니다.

#### A) 대시보드로 적용 (권장)
- 위 공통 절차대로 저장 + `Apply Direct Link Now` 실행

#### B) Linux에서 수동 확인
```bash
ip -br link
ip -br addr
ip route
```

PC 쪽에서 호스트 직결 IP 핑 테스트:
```bash
ping -c 4 10.77.0.1
```

### 12.4 클라이언트 PC(상대편) IP 수동 설정
직결 링크는 DHCP가 없을 수 있으므로, PC NIC도 같은 대역으로 **수동 IP**를 지정해야 합니다.

- 예시
  - 호스트(Vantage): `10.77.0.1/24`
  - 클라이언트 PC: `10.77.0.2/24`
  - 게이트웨이: 비워도 됨(직결 전용일 때)

### 12.5 대시보드에서 정상 여부 확인
`Systems & Telemetry > Direct Link NIC` 카드에서 다음을 확인합니다.
- `Matched NIC`가 기대 NIC와 일치
- `Host IPv4`가 설정값과 일치
- `Link`가 `up`
- 상태 Pill이 `Healthy`
- `Needs Check` 또는 note 표시 시 NIC 이름/케이블/상대편 IP/MTU를 재확인

## 13. 데이터 파일 위치
- `app/data/ak620-state.json`
- `app/data/power-history.jsonl`
- `app/data/metrics/*.jsonl`
- `app/data/steam-queue.json`
- `app/data/steam-session.json`
