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
- **로그 뷰어**: systemd 저널 로그 조회 (vantage-backend, vantage-llm-gateway, vllm-coder, vantage-ak620-agent)
- **대시보드**: React + TypeScript + Vite 기반 SPA, 백엔드와 동일 포트(18080) 제공

## 시스템 스펙 (서버)
- **CPU**: AMD Ryzen 7 5700X
- **GPU**: Dell OEM RTX 3090 ×2
- **메인보드**: ASUS TUF Gaming X570-PRO (Wi-Fi)
- **RAM**: Corsair Vengeance LPX DDR4 64GB
- **SSD**: Samsung 980 NVMe 1TB
- **PSU**: FSP Hydro PTM PRO 1200W
- **쿨러**: DeepCool AK620 Digital
- **케이스**: Lian Li O11 Air Mini
- **팬**: 하단 ARCTIC P12 Slim ×2, 상단 Arctic P12 PWM PST ×2

## 프로젝트 구조
```
Vantage/
├── app/                          # 메인 애플리케이션
│   ├── src/
│   │   ├── server/               # 백엔드 서버 (Express + TypeScript)
│   │   │   ├── platforms/       # 플랫폼별 컨트롤러 (linux.ts, win32.ts)
│   │   │   ├── api/            # API 라우터 (power.ts, llm.ts, system.ts)
│   │   │   ├── server.ts        # 메인 서버 엔트리포인트
│   │   │   ├── system-monitor.ts # 시스템 메트릭스 수집
│   │   │   ├── power-controller.ts # 전력 모드 제어
│   │   │   ├── power-tracker.ts # 전력 소비 추적 (kWh, 비용)
│   │   │   ├── stress-runner.ts # 스트레스 테스트 상태 추적
│   │   │   ├── config.ts       # 설정 관리
│   │   │   └── shell.ts       # 셸 명령 실행 추상화
│   │   ├── client/              # 프론트엔드 대시보드 (React + TypeScript + Vite)
│   │   │   ├── src/            # React 소스
│   │   │   └── dist/          # 빌드 결과물 (백엔드가 정적 파일로 서빙)
│   │   ├── shared/              # 공유 타입 (types.ts)
│   │   ├── index.html          # HTML 셸
│   │   ├── vite.config.ts      # Vite 설정 (outDir: dist/client/)
│   │   └── tsconfig.server.json # 서버 빌드 설정
│   ├── data/                     # 런타임 데이터 (ak620-state.json 등)
│   ├── config.json               # 메인 설정 파일
│   └── package.json             # 의존성 및 스크립트
├── services/                     # 마이크로서비스
│   ├── ak620-agent/             # AK620 Digital 디스플레이 제어 (상태 파일 IPC)
│   ├── llm-gateway/             # LLM API 게이트웨이 (upstream URL 프록시)
│   ├── system-agent/             # 시스템 에이전트 (미래 확장)
│   ├── adaptive-engine/          # 적응형 전력 엔진 (미래 확장)
│   └── common/                 # 공유 인터페이스 및 타입
├── scripts/                     # 설치/제거 스크립트
└── README.md
```

## 시스템 전력 측정
AMD Ryzen 시스템을 보정하기 위해 기본 전력 보정 공식(`15W + 85W * usage`)을 적용하여 보정합니다. (2026-05-01 업데이트: sampleCpuPowerW 함수 개선)

## 코드 정리 요약 (2026-05-03)
### 삭제된 파일
- `app/src/server/stress-tester.ts`: 미사용 파일 삭제 (플랫폼 컨트롤러인 linux.ts/win32.ts가 동일 기능 구현)

### 수정된 파일
- **system-monitor.ts**:
  - `@ts-nocheck` 삭제 (타입 검사 활성화)
  - `driverName` 변수 주석 처리 (미래 RAPL 식별용 보존)
  - `sampleCpuPowerW()` 개선: 유휴 15W, 최대 100W 선형 모델 구현
- **api/system.ts**: 스트레스 테스트 엔드포인트 추가 (POST /system/test/cpu, POST /system/test/memory, GET /system/test/status)
- **platforms/linux.ts, win32.ts**: 스트레스 테스트 및 Memtest86 기능 구현
- **client/src/App.tsx**: 스트레스 테스트 버튼 추가, 중복 패널 제거

### 새로 추가된 기능 (2026-05-03)
- **스트레스 테스트 상태 추적** (`stress-runner.ts`):
  - Fire-and-forget 패턴으로 HTTP 블로킹 방지
  - `getStressStatus()`로 테스트 상태 조회
  - 지정 시간 후 자동 종료, 상태 만료 감지
- **AK620 상태 파일 IPC**:
  - AK620 에이전트: `app/data/ak620-state.json`에 상태 작성
  - 백엔드: 동일 파일 읽어 `makeAk620View()`에 반영
  - 실시간 온도, BAR 레벨, 연결 상태 동기화
- **api.ts 엔드포인트 수정**:
  - `memtest` → `/api/system/test/memtest` (URL 수정)
  - `runStress`, `stressStatus` 삭제 (비표준 엔드포인트)
- **AK620 에이전트 CONFIG_PATH 수정**: `apps/backend/config.json` → `app/config.json`

### 주의사항
- `makeAk620View()` 함수는 이제 `app/data/ak620-state.json`에서 실데이터를 읽습니다 (폴백: 하드코딩된 기본값)
- 플랫폼 컨트롤러의 CONFIG_PATH 및 설정 읽기 로직은 각 플랫폼별로 독립적 관리 (아키텍처상 합리적 중복)
- 스트레스 테스트는 백그라운드에서 실행되며, 상태는 `getStressStatus()`로 확인 가능

## 2. Docker 및 Docker Compose 설치
```bash
# Docker 공식 설치 스크립트 사용
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 현재 사용자에게 Docker 권한 부여
sudo usermod -aG docker $USER
# 변경 사항을 적용하려면 재접속하거나 아래 명령 실행
newgrp docker
```

## 3. NVIDIA 드라이버 및 Docker 컨테이너 툴킷 설치
GPU 가속을 위해 NVIDIA Toolkit을 설치합니다.
```bash
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt update
sudo apt install -y nvidia-docker2
sudo systemctl restart docker
```

## 4. 프로젝트 클론 및 설정
```bash
git clone <프로젝트_레포지토리_주소>
cd Vantage
# config.json 등 필수 환경 설정 확인
```

## 5. 루트 기준 빌드 및 로컬 실행
프로젝트 루트(`D:\Work\Vantage`)에는 workspace용 `package.json`이 있으며, 서버와 클라이언트를 한 번에 빌드할 수 있습니다.

### 전체 빌드
```bash
cd D:\Work\Vantage
npm run build
```

위 명령은 루트 `package.json`의 `build` 스크립트를 통해 `app` 워크스페이스의 전체 빌드를 실행합니다. 내부적으로는 서버 TypeScript 빌드와 Vite 클라이언트 빌드를 모두 수행합니다.

### 서버만 빌드
```bash
cd D:\Work\Vantage
npm run build:server
```

### 클라이언트만 빌드
```bash
cd D:\Work\Vantage
npm run build:client
```

### 로컬에서 서버 실행
빌드 후에는 프로젝트 루트에서 바로 서버를 실행할 수 있습니다.

```bash
cd D:\Work\Vantage
npm run start
```

`npm run start`는 내부적으로 `app` 워크스페이스의 서버 엔트리(`dist/app/src/server/server.js`)를 실행합니다.

기존처럼 `app` 디렉터리에서 직접 실행해도 됩니다.

```bash
cd D:\Work\Vantage\app
npm run start
```

실행 후 브라우저에서 다음 주소로 접속합니다.

```text
http://localhost:18080
```

### 루트에서 개발 모드 실행
루트에서 백엔드와 클라이언트를 함께 개발 실행하려면 다음 명령을 사용합니다.

```bash
cd D:\Work\Vantage
npm run dev
```

`npm run dev`는 내부적으로 백엔드(`npm run dev:server -w app`)와 클라이언트(`npm run dev:client -w app`)를 동시에 실행합니다.

백엔드만 따로 실행하려면:

```bash
cd D:\Work\Vantage
npm run dev:server
```

클라이언트만 따로 실행하려면:

```bash
cd D:\Work\Vantage
npm run dev:client
```

### Windows 실행 참고
- `npm run start`는 프로덕션 빌드 결과(`dist/app/src/server/server.js`)를 실행합니다.
- `npm run dev`는 백엔드 TypeScript 서버와 Vite 클라이언트를 동시에 실행합니다.
- `npm run dev:server`는 빌드 없이 TypeScript 서버 소스를 직접 실행합니다.
- Windows에서는 systemd 서비스가 없으므로 일부 서비스 상태가 `inactive`로 보이는 것이 정상입니다.
- GPU/전력 정보는 NVIDIA 드라이버 및 `nvidia-smi` 동작 여부에 따라 표시됩니다.

## 6. 전체 자동 설치 (권장)
Vantage 프로젝트와 모든 서비스(vLLM 포함), systemd 설정을 한 번에 자동 설치합니다.
```bash
sudo ./install-vantage.sh
```

## 7. 프로젝트 삭제 (Uninstall)
Vantage 프로젝트와 관련된 모든 서비스, 설정, 사용자 데이터를 제거합니다.
```bash
sudo ./uninstall-vantage.sh
```

## 8. 검증
```bash
# 서비스 상태 확인
systemctl status vantage-backend
systemctl status vantage-llm-gateway
systemctl status vantage-ak620-agent

# 스트레스 테스트 (백엔드 API)
curl -X POST http://localhost:18080/api/system/test/cpu \
  -H "Authorization: Bearer $VANTAGE_SYSTEM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"durationSeconds": 60}'

# 스트레스 테스트 상태 확인
curl http://localhost:18080/api/system/test/status \
  -H "Authorization: Bearer $VANTAGE_SYSTEM_TOKEN"

# 참고: stress test 시작/실패/종료는 backend 로그(stdout/service log)에 기록됩니다.

# Memtest86 재부팅 (Linux만 지원)
curl -X POST http://localhost:18080/api/system/test/memtest \
  -H "Authorization: Bearer $VANTAGE_SYSTEM_TOKEN"
```

웹 브라우저 접속:
- 통합 대시보드 및 Backend API: `http://<서버IP>:18080`
- LLM 엔드포인트: `http://<서버IP>:8080`

`install-vantage.sh`는 `app/src/client/`의 Node 프로젝트를 감지해 의존성 설치와 React/TypeScript 빌드를 자동으로 수행합니다. 빌드 결과물은 `app/dist/client/`에 생성되며, `vantage-backend.service`가 같은 포트(18080)에서 정적 대시보드(`app/dist/client/`)와 `/api/*`를 함께 제공합니다. 별도 `vantage-dashboard.service`는 더 이상 기본 기동 대상이 아닙니다.

## 9. 토큰 / 보안 운영
전원 모드 변경, vLLM 시작/종료, 로그 조회, 시스템 재부팅/종료, 스트레스 테스트 같은 운영 API는 `VANTAGE_SYSTEM_TOKEN` Bearer token이 필요합니다. 설치 스크립트는 `/etc/vantage/backend.env`에 시스템 제어용 토큰과 LLM gateway 내부 호출용 토큰을 자동 생성하고, 관련 서비스들이 이 파일을 `EnvironmentFile`로 읽습니다.

```bash
sudo cat /etc/vantage/backend.env
# VANTAGE_SYSTEM_TOKEN=<token>
# VANTAGE_LLM_GATEWAY_TOKEN=<token>
```

- `VANTAGE_SYSTEM_TOKEN`: 백엔드 보호 API 제어용 canonical 토큰
- `VANTAGE_LLM_GATEWAY_TOKEN`: `vantage-llm-gateway.service`가 backend의 `/api/llm/start`, `/api/llm/touch`를 호출할 때 쓰는 내부 토큰 (기본값 `x`) 

대시보드 로그인 후 보호된 작업은 내부적으로 인증되어 전송됩니다. 토큰을 직접 교체한 경우 backend와 gateway를 재시작하세요.

```bash
sudo systemctl restart vantage-backend
sudo systemctl restart vantage-llm-gateway
```

### 운영 환경 전환 체크리스트
1. 기존 서버의 `/etc/vantage/backend.env`를 열어 `VANTAGE_SYSTEM_TOKEN`과 `VANTAGE_LLM_GATEWAY_TOKEN`이 모두 존재하는지 확인합니다.
2. 새로 배포하는 경우 루트의 `backend.env.example`을 바로 복사해 쓰거나, `.env.vantage.example`을 참고해 `/etc/vantage/backend.env`를 구성합니다.
3. `backend.env.example`은 운영 배포용 최소 예시이고, `.env.vantage.example`은 변수 의미까지 포함한 참고 템플릿입니다.
4. `VANTAGE_LLM_GATEWAY_TOKEN`을 별도 분리하지 않을 계획이면 기본값 `x`를 유지하거나, `VANTAGE_SYSTEM_TOKEN`과 같은 값으로 맞춰도 됩니다.
5. 토큰 값을 변경한 뒤에는 반드시 아래 두 서비스를 다시 시작합니다.
6. 재시작 후 `/api/login`과 보호 API(예: `/api/llm/touch`)가 모두 정상 응답하는지 확인합니다.

### 운영 검증 예시
```bash
curl -X POST http://<서버IP>:18080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"18184444"}'

curl -X POST http://<서버IP>:18080/api/llm/touch \
  -H "Authorization: Bearer $VANTAGE_SYSTEM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 10. 전력 표시 참고
대시보드의 **Estimated System Power**는 GPU 실측 전력(`nvidia-smi`) + CPU 전력 + 기본 시스템 전력 추정치를 합산한 값입니다. Linux에서 RAPL(`/sys/class/powercap`)을 읽을 수 있으면 CPU 전력을 delta 기반 실측값으로 계산하고, 그렇지 않으면 CPU 사용률 기반 추정치로 fallback합니다.

기본 시스템 전력은 `app/config.json`의 `powerTracking.basePowerEstimateW`를 우선 사용하며, 필요 시 `VANTAGE_BASE_SYSTEM_POWER_W` 환경 변수로 덮어쓸 수 있습니다. CPU 추정 fallback은 `sampleCpuPowerW()` 함수의 선형 모델(유휴 15W ~ 최대 100W)을 사용합니다.

## 11. sudo 권한 설정
백엔드에서 시스템 명령(systemctl, nvidia-smi 등)을 실행하려면 sudoers 설정이 필요합니다.

```bash
sudo visudo
# 아래 내용 추가 (vantage 사용자로 실행 시 비밀번호 없이 허용):
vantage ALL=(root) NOPASSWD: /bin/systemctl reboot
vantage ALL=(root) NOPASSWD: /bin/systemctl poweroff
vantage ALL=(root) NOPASSWD: /bin/systemctl start vllm-coder.service
vantage ALL=(root) NOPASSWD: /bin/systemctl stop vllm-coder.service
vantage ALL=(root) NOPASSWD: /usr/bin/stress-ng
vantage ALL=(root) NOPASSWD: /usr/bin/grub-reboot
```

## 12. 데이터 파일 위치
- **AK620 상태 파일**: `app/data/ak620-state.json` (AK620 에이전트가 작성, 백엔드가 읽음)
- **전력 추적 데이터**: `app/data/power-history.jsonl` (power-tracker.ts가 기록)
- **메트릭스 데이터**: `app/data/metrics/*.jsonl` (system-monitor.ts가 기록)
