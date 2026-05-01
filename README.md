# Vantage

Vantage는 듀얼 RTX 3090 기반 로컬 AI 서버를 저전력 모드와 고성능 LLM 모드 사이에서 운용하는 always-on 플랫폼입니다.

## 현재 구현 범위

- Backend API (`apps/backend/src/server.ts`)
  - `GET /health`
  - `GET /api/status`
  - `POST /api/mode`
  - `POST /api/llm-gateway/enabled`
  - `POST /api/llm/start`
  - `POST /api/llm/stop`
  - `POST /api/llm/touch` (Adaptive idle 타이머 keepalive)
  - `GET /api/ak620/status`
  - `POST /api/ak620/refresh-interval`
  - `GET /api/logs?service=...&lines=...`
  - `POST /api/system/reboot`
  - `POST /api/system/shutdown`
- LLM Gateway (`services/llm-gateway/src/index.ts`)
  - `/v1/*` OpenAI 호환 프록시
  - 요청 시 backend `llm/start` + `llm/touch` 연동
- Dashboard (`apps/dashboard/index.html`)
  - 상태 조회, 전력 모드 전환, LLM start/stop/touch UI
- 전력 모드 스크립트 (`scripts/vantage-power-*.sh`)
- vLLM 시작/중지 스크립트
- systemd 서비스 유닛 7종

## 디렉터리

- `apps/backend/config.json`: 런타임 설정
- `apps/backend/src/*`: 백엔드 코드
- `apps/dashboard/index.html`: 대시보드 정적 UI
- `services/llm-gateway/src/*`: OpenAI 호환 게이트웨이
- `services/ak620-agent/src/*`: AK620 에이전트
- `services/adaptive-engine/src/*`: Adaptive 모드 보정 엔진
- `services/system-agent/src/*`: systemd 서비스 상태 수집 에이전트
- `scripts/*`: 전력/LLM 제어 + 설치 스크립트
- `systemd/*`: 서비스 유닛 파일

## 한방 설치 (권장)

> ⚠️ `/opt`, `systemd`, 서비스 계정 생성을 포함하므로 **root 권한(또는 sudo 가능 계정)** 이 필요합니다.

Ubuntu 서버에서 프로젝트 루트에서 실행:

```bash
chmod +x ./scripts/install-vantage.sh
./scripts/install-vantage.sh
```

### 다른 경로의 소스에서 설치할 때

```bash
chmod +x ./scripts/install-vantage.sh
./scripts/install-vantage.sh /path/to/vantage
```

### 유용한 옵션

```bash
# 실제 실행 없이 명령만 확인
./scripts/install-vantage.sh --dry-run

# npm install/build 단계 스킵
./scripts/install-vantage.sh --skip-build

# 설치 대상 경로/서비스 유저 변경
./scripts/install-vantage.sh --target-dir /opt/vantage --service-user vantage

# 도움말
./scripts/install-vantage.sh --help
```

### 자동 빌드 동작

- `apps/backend`: `package.json` 있으면 자동 install + build
- `apps/dashboard`: `package.json` 있으면 자동 install + build (정적 HTML-only면 자동 스킵)
- `services/ak620-agent`: 자동 install + build
- `services/llm-gateway`: 자동 install + build
- `services/adaptive-engine`: 자동 install + build
- `services/system-agent`: 자동 install + build
- lockfile 있으면 `npm ci`, 없으면 `npm install`

### 한방 설치가 자동으로 수행하는 작업

- `/opt/vantage` 배포 (`rsync --delete`) → 대시보드/백엔드/스크립트 포함 전체 배포
- `vantage` 서비스 계정 생성/권한 설정
- backend / dashboard(조건부) / ak620-agent / llm-gateway / adaptive-engine / system-agent 빌드
- 스크립트 실행권한 자동 부여 (`chmod +x /opt/vantage/scripts/*.sh`)
- systemd 유닛 설치 + `daemon-reload`
- 핵심 서비스 `enable` + `restart`

### 설치 완료 확인

```bash
sudo systemctl --no-pager --full status vantage-backend.service
sudo systemctl --no-pager --full status vantage-dashboard.service
sudo systemctl --no-pager --full status vantage-ak620-agent.service
sudo systemctl --no-pager --full status vllm-coder.service
sudo systemctl --no-pager --full status vantage-llm-gateway.service
sudo systemctl --no-pager --full status vantage-adaptive-engine.service
sudo systemctl --no-pager --full status vantage-system-agent.service
```

문제가 있으면 먼저 `journalctl -u <service-name> -n 200 --no-pager` 로 로그를 확인하세요.

## 수동 설치 절차

### 1) 파일 배치

```bash
sudo mkdir -p /opt/vantage
sudo rsync -av ./ /opt/vantage/
```

### 2) 의존성 설치 및 빌드

```bash
cd /opt/vantage/apps/backend
npm install
npm run build

cd /opt/vantage/services/ak620-agent
npm install
npm run build

cd /opt/vantage/services/llm-gateway
npm install
npm run build

cd /opt/vantage/services/adaptive-engine
npm install
npm run build

cd /opt/vantage/services/system-agent
npm install
npm run build
```

### 3) 실행 권한 부여

```bash
sudo chmod +x /opt/vantage/scripts/*.sh
```

### 4) 서비스 계정 생성

```bash
sudo useradd -r -s /bin/false vantage || true
sudo chown -R vantage:vantage /opt/vantage
```

### 5) systemd 유닛 설치

```bash
sudo cp /opt/vantage/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### 6) 재부팅 후 자동시작(항상 켜짐)

```bash
sudo systemctl enable vantage-backend.service
sudo systemctl enable vantage-dashboard.service
sudo systemctl enable vantage-ak620-agent.service
sudo systemctl enable vllm-coder.service
sudo systemctl enable vantage-llm-gateway.service
sudo systemctl enable vantage-adaptive-engine.service
sudo systemctl enable vantage-system-agent.service
```

### 7) 즉시 시작

```bash
sudo systemctl start vantage-backend.service
sudo systemctl start vantage-dashboard.service
sudo systemctl start vantage-ak620-agent.service
sudo systemctl start vllm-coder.service
sudo systemctl start vantage-llm-gateway.service
sudo systemctl start vantage-adaptive-engine.service
sudo systemctl start vantage-system-agent.service
```

### 8) 상태 확인

```bash
sudo systemctl status vantage-backend.service
sudo systemctl status vantage-dashboard.service
sudo systemctl status vantage-ak620-agent.service
sudo systemctl status vllm-coder.service
sudo systemctl status vantage-llm-gateway.service
sudo systemctl status vantage-adaptive-engine.service
sudo systemctl status vantage-system-agent.service
```

## 저전력 모드 동작

`LOW_POWER` 모드 적용 시:

- GPU power limit 50~70W 권장 (기본 60W)
- CPU governor powersave
- 일부 비필수 서비스 중지
- vLLM 중지

## 참고

- 실제 하드웨어별 최소 전력/클럭 한계는 다를 수 있습니다.
- AK620 Agent는 하드웨어 연결 실패 시에도 루프를 유지하며 안전하게 동작합니다.
