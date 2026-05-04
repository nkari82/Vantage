# Vantage 프로젝트 - 백엔드 엔드포인트 & 설정 필드 발견 보고서

**생성일**: 2026-05-01  
**범위**: apps/backend, apps/dashboard, services/  
**목표**: Vantage_PLAN.md 섹션 6.5 & 11.x 대시보드 기능 구현을 위한 기존 리소스 매핑

---

## 1. 백엔드 API 엔드포인트 (apps/backend/src/server.ts)

### 1.1 현재 구현된 엔드포인트

| 메서드 | 경로 | 요청 본문 | 응답 | 설명 |
|--------|------|---------|------|------|
| GET | `/health` | - | `{ ok: true, service: "vantage-backend" }` | 헬스 체크 |
| GET | `/api/status` | - | `SystemStatus` (아래 참조) | 시스템 전체 상태 조회 |
| POST | `/api/mode` | `{ mode: PowerMode }` | `{ ok: true, mode: PowerMode }` | 전력 모드 변경 |
| POST | `/api/llm-gateway/enabled` | `{ enabled: boolean }` | `{ ok: true, enabled: boolean }` | LLM Gateway 활성화/비활성화 |
| POST | `/api/llm/touch` | `{}` | `{ ok: true, lastUsedAt: number \| null }` | Adaptive idle 타이머 갱신 |
| POST | `/api/llm/start` | `{}` | `{ ok: true }` | vLLM 서비스 시작 |
| POST | `/api/llm/stop` | `{}` | `{ ok: true }` | vLLM 서비스 중지 |
| GET | `/api/ak620/status` | - | `Ak620StatusView` (아래 참조) | AK620 디스플레이 상태 |

### 1.2 응답 스키마 (TypeScript 타입)

#### SystemStatus (GET /api/status)
```typescript
{
  mode: PowerMode;                    // "DEFAULT" | "LOW_POWER" | "STANDARD_250" | "STANDARD_280" | "ADAPTIVE"
  llmGatewayEnabled: boolean;         // LLM Gateway 활성화 여부
  llmReady: boolean;                  // vLLM 서비스 실행 중 여부
  lastUsedAt: number | null;          // 마지막 LLM 요청 타임스탬프 (ms)
  gpus: GpuStatus[];                  // GPU 상태 배열
  gateway: GatewayStatusView;         // ⚠️ 현재 응답에 포함되지 않음 (필드 누락)
  ak620: Ak620StatusView;             // ⚠️ 현재 응답에 포함되지 않음 (필드 누락)
}
```

#### GpuStatus (배열 요소)
```typescript
{
  index: number;                      // GPU 인덱스 (0, 1)
  temperatureC: number;               // GPU 온도 (°C)
  powerW: number;                     // 현재 전력 소비 (W)
  powerLimitW: number;                // GPU 전력 제한 (W)
  memoryUsedMiB: number;              // 사용 중인 VRAM (MiB)
  memoryTotalMiB: number;             // 전체 VRAM (MiB)
  utilization: number;                // GPU 사용률 (%)
}
```

#### GatewayStatusView (⚠️ 누락됨)
```typescript
{
  enabled: boolean;
  upstreamUrl: string;
  listenPort: number;
  idleTimeoutMinutes: number;
  lastUsedAt: number | null;
  idleRemainingSeconds: number;
}
```

#### Ak620StatusView (부분 구현)
```typescript
{
  connected: boolean;                 // ✓ 구현됨
  currentTarget: "CPU" | "GPU0" | "GPU1";  // ✓ 구현됨
  barLevel: 1 | 2 | 3;               // ✓ 구현됨
  temperatureC: number;               // ✓ 구현됨
  refreshIntervalSeconds: number;     // ✓ 구현됨
  minRefreshInterval: number;         // ⚠️ 누락됨
  maxRefreshInterval: number;         // ⚠️ 누락됨
}
```

---

## 2. 설정 필드 (apps/backend/config.json)

### 2.1 현재 설정 구조

```json
{
  "ak620": {
    "refreshIntervalSeconds": 4,      // 현재 갱신 주기 (초)
    "minRefreshInterval": 1,          // 최소 갱신 주기 (초)
    "maxRefreshInterval": 60          // 최대 갱신 주기 (초)
  },
  "lowPowerMode": {
    "gpuPowerLimitW": 60,             // 저전력 모드 GPU 전력 제한 (W)
    "cpuGovernor": "powersave",       // CPU 전력 관리 정책
    "stopServices": ["cron", "unnecessary-daemons"],  // 중지할 서비스 목록
    "nvmePowerSave": true,            // NVMe 전력 절약 모드 활성화
    "fanMinRpm": true                 // 팬 최소 RPM 제어
  },
  "llmGateway": {
    "enabled": true,                  // Gateway 활성화 여부
    "upstreamUrl": "http://127.0.0.1:8000",  // vLLM 업스트림 URL
    "listenPort": 8080,               // Gateway 수신 포트
    "idleTimeoutMinutes": 30,         // Idle timeout (분)
    "autoStartVllm": true,            // 자동 vLLM 시작
    "autoStopVllm": true,             // 자동 vLLM 중지
    "activePowerMode": "STANDARD_280",  // 활성 시 전력 모드
    "idlePowerMode": "LOW_POWER"      // Idle 시 전력 모드
  },
  "powerModes": {
    "LOW_POWER": {
      "gpuPowerLimitW": 60,
      "cpuGovernor": "powersave",
      "description": "GPU 최소 전력, 시스템 최소 대기전력"
    },
    "STANDARD_250": {
      "gpuPowerLimitW": 250,
      "cpuGovernor": "ondemand",
      "description": "조용한 LLM 운용"
    },
    "STANDARD_280": {
      "gpuPowerLimitW": 280,
      "cpuGovernor": "performance",
      "description": "권장 LLM 운용"
    },
    "DEFAULT": {
      "gpuPowerLimitW": 150,
      "cpuGovernor": "ondemand",
      "description": "기본 고성능 운용 모드"
    }
  }
}
```

### 2.2 환경 변수 오버라이드

| 환경 변수 | 기본값 | 설명 |
|----------|--------|------|
| `VANTAGE_BACKEND_PORT` | 18080 | 백엔드 수신 포트 |
| `VANTAGE_CONFIG_PATH` | `../config.json` | 설정 파일 경로 |
| `AK620_REFRESH_INTERVAL` | config.json 값 | AK620 갱신 주기 (초) |
| `VANTAGE_SCRIPTS_DIR` | `../../../scripts` | 전력 모드 스크립트 디렉터리 |

---

## 3. 데이터베이스 모델 & 스키마

### 3.1 현재 상태
**⚠️ 데이터베이스 모델 없음** - 모든 상태는 메모리 변수로 관리됨

```typescript
// server.ts 내 메모리 상태
let currentMode: PowerMode = "ADAPTIVE";
let lastUsedAt: number | null = null;
let llmGatewayEnabled = config.llmGateway.enabled;
let adaptiveTransitionInProgress = false;
```

### 3.2 필요한 모델 (구현 필요)

#### 1. PowerModeHistory (전력 모드 전환 이력)
```typescript
{
  timestamp: number;
  fromMode: PowerMode;
  toMode: PowerMode;
  reason: string;  // "manual" | "adaptive_idle" | "adaptive_active"
  duration: number;  // 이전 모드 지속 시간 (ms)
}
```

#### 2. SystemLog (시스템 로그)
```typescript
{
  timestamp: number;
  service: string;  // "backend" | "gateway" | "ak620-agent" | "vllm"
  level: "info" | "warn" | "error";
  message: string;
  metadata?: Record<string, unknown>;
}
```

#### 3. GpuMetrics (GPU 메트릭 히스토리)
```typescript
{
  timestamp: number;
  gpuIndex: number;
  temperatureC: number;
  powerW: number;
  powerLimitW: number;
  memoryUsedMiB: number;
  memoryTotalMiB: number;
  utilization: number;
}
```

---

## 4. 대시보드 UI 컴포넌트 (apps/dashboard/index.html)

### 4.1 현재 구현된 UI

| 섹션 | 컴포넌트 | 상태 |
|------|---------|------|
| **전력 모드** | 5개 모드 버튼 (DEFAULT, LOW_POWER, STANDARD_250, STANDARD_280, ADAPTIVE) | ✓ 구현됨 |
| **LLM 제어** | Start / Stop / Keepalive Touch 버튼 | ✓ 구현됨 |
| **현재 상태** | 상태 요약 + JSON 표시 | ✓ 기본 구현 |
| **자동 갱신** | 5초 주기 상태 갱신 | ✓ 구현됨 |

### 4.2 Vantage_PLAN.md 섹션 6.5 요구사항 vs 현재 구현

#### 섹션 6.5: LLM Gateway UI 요구사항
```
[LLM Gateway]
- Enabled / Disabled 토글                    ⚠️ 없음
- Gateway 상태                               ⚠️ 없음
- vLLM 상태                                  ✓ 부분 (llmReady)
- Upstream URL                               ⚠️ 없음
- 마지막 요청 시간                           ⚠️ 없음
- idle timeout 남은 시간                     ⚠️ 없음
- 수동 vLLM 시작/중지 버튼                   ✓ 있음
```

### 4.3 Vantage_PLAN.md 섹션 11.x 요구사항 vs 현재 구현

#### 섹션 11.1: Overview
```
- 현재 모드                                  ✓ 있음
- 총 GPU 전력                                ⚠️ 없음 (개별 GPU만 표시)
- LLM 상태                                   ✓ 있음
- Gateway 상태                               ⚠️ 없음
- CPU/GPU 온도 요약                          ⚠️ 없음
```

#### 섹션 11.2: Power
```
- Adaptive Mode                              ✓ 있음
- Low Power Mode                             ✓ 있음
- Standard 250                               ✓ 있음
- Standard 280                               ✓ 있음
- Turbo                                      ✓ 있음
- 현재 power limit 표시                      ⚠️ 없음
```

#### 섹션 11.3: LLM Gateway
```
- Gateway Enabled / Disabled 토글            ⚠️ 없음
- vLLM Running / Stopped                     ✓ 부분
- 마지막 요청 시간                           ⚠️ 없음
- idle timeout 표시                          ⚠️ 없음
- 수동 Start/Stop                            ✓ 있음
```

#### 섹션 11.4: GPU
```
- GPU0/GPU1 온도                             ✓ 있음
- VRAM 사용량                                ✓ 있음
- Power Draw                                 ✓ 있음
- Power Limit                                ✓ 있음
- Utilization                                ✓ 있음
```

#### 섹션 11.5: AK620
```
- 연결 상태                                  ✓ 있음
- 현재 표시 대상                             ✓ 있음
- 현재 온도                                  ✓ 있음
- 바 표시 상태                               ✓ 있음
- 순환 주기 설정                             ⚠️ 없음
```

#### 섹션 11.6: Logs
```
- systemd 로그                               ⚠️ 없음
- vLLM 로그                                  ⚠️ 없음
- Gateway 로그                               ⚠️ 없음
- Power Mode 전환 이력                       ⚠️ 없음
- AK620 Agent 로그                           ⚠️ 없음
```

---

## 5. LLM Gateway 서비스 (services/llm-gateway/src/index.ts)

### 5.1 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | 헬스 체크 |
| * | `/v1/*` | OpenAI 호환 프록시 (모든 메서드) |

### 5.2 동작 흐름

```
클라이언트 요청 → /v1/* 
  ↓
POST /api/llm/start (if autoStart=true)
POST /api/llm/touch
  ↓
프록시 → vLLM (http://127.0.0.1:8000)
  ↓
응답 반환
```

### 5.3 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `VANTAGE_BACKEND_URL` | `http://127.0.0.1:18080` | 백엔드 URL |
| `VANTAGE_UPSTREAM_URL` | `http://127.0.0.1:8000` | vLLM 업스트림 URL |
| `VANTAGE_LLM_GATEWAY_PORT` | 8080 | Gateway 수신 포트 |
| `VANTAGE_AUTO_START_VLLM` | "true" | 자동 vLLM 시작 |

---

## 6. AK620 Agent 서비스 (services/ak620-agent/src/)

### 6.1 파일 구조

| 파일 | 역할 |
|------|------|
| `index.ts` | 에이전트 진입점, 갱신 루프 |
| `device.ts` | HID 장치 연결 (node-hid) |
| `sensors.ts` | CPU/GPU 온도 수집 (nvidia-smi, sensors) |
| `display-cycle.ts` | CPU/GPU0/GPU1 순환 표시 로직 |
| `protocol.ts` | DeepCool 패킷 생성 |
| `types.ts` | TypeScript 타입 정의 |

### 6.2 HID 장치 정보

```typescript
const VENDOR_ID = 0x3633;
const PRODUCT_ID = 0x0002;
```

### 6.3 온도 수집 (sensors.ts)

```typescript
// GPU 온도
nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits

// CPU 온도
sensors  // lm-sensors 명령어
```

### 6.4 디스플레이 패킷 형식 (protocol.ts)

```typescript
// 현재 플레이스홀더 구현
[0xAA, 0x55, barLevel, safeTemp, 0x00, 0x00, 0x0D, 0x0A]
// barLevel: 1 (CPU) | 2 (GPU0) | 3 (GPU1)
// safeTemp: 0~99 (온도)
```

### 6.5 순환 표시 로직 (display-cycle.ts)

```
CPU (barLevel=1) → GPU0 (barLevel=2) → GPU1 (barLevel=3) → CPU → ...
갱신 주기: config.json의 ak620.refreshIntervalSeconds (기본 4초)
```

---

## 7. 타입 정의 (apps/backend/src/types.ts)

### 7.1 PowerMode
```typescript
type PowerMode = "DEFAULT" | "LOW_POWER" | "STANDARD_250" | "STANDARD_280" | "ADAPTIVE";
```

### 7.2 설정 인터페이스

```typescript
interface Ak620Config {
  refreshIntervalSeconds: number;
  minRefreshInterval: number;
  maxRefreshInterval: number;
}

interface LowPowerModeConfig {
  gpuPowerLimitW: number;
  cpuGovernor: "powersave" | "performance" | "ondemand";
  stopServices: string[];
  nvmePowerSave: boolean;
  fanMinRpm: boolean;
}

interface LlmGatewayConfig {
  enabled: boolean;
  upstreamUrl: string;
  listenPort: number;
  idleTimeoutMinutes: number;
  autoStartVllm: boolean;
  autoStopVllm: boolean;
  activePowerMode: Exclude<PowerMode, "ADAPTIVE">;
  idlePowerMode: Exclude<PowerMode, "ADAPTIVE">;
}

interface PowerModeDetail {
  gpuPowerLimitW: number;
  cpuGovernor: "powersave" | "performance" | "ondemand";
  description: string;
}

interface AppConfig {
  ak620: Ak620Config;
  lowPowerMode: LowPowerModeConfig;
  llmGateway: LlmGatewayConfig;
  powerModes: Record<Exclude<PowerMode, "ADAPTIVE">, PowerModeDetail>;
}
```

---

## 8. 누락된 필드 & 구현 필요 항목

### 8.1 백엔드 API 응답 누락 필드

#### GET /api/status 응답에 추가 필요
```typescript
// 현재 응답에 없음:
gateway: GatewayStatusView {
  enabled: boolean;
  upstreamUrl: string;
  listenPort: number;
  idleTimeoutMinutes: number;
  lastUsedAt: number | null;
  idleRemainingSeconds: number;
}

ak620: Ak620StatusView {
  // 현재 구현:
  connected: boolean;
  currentTarget: "CPU" | "GPU0" | "GPU1";
  barLevel: 1 | 2 | 3;
  temperatureC: number;
  refreshIntervalSeconds: number;
  
  // 누락:
  minRefreshInterval: number;
  maxRefreshInterval: number;
}
```

### 8.2 새로운 엔드포인트 필요

```
GET /api/gateway/status
  응답: GatewayStatusView

POST /api/ak620/refresh-interval
  요청: { refreshIntervalSeconds: number }
  응답: { ok: true, refreshIntervalSeconds: number }

GET /api/logs
  쿼리: ?service=backend&limit=100&offset=0
  응답: { logs: SystemLog[], total: number }

GET /api/power-history
  쿼리: ?limit=50&offset=0
  응답: { history: PowerModeHistory[], total: number }

GET /api/gpu-metrics
  쿼리: ?gpuIndex=0&limit=100&offset=0
  응답: { metrics: GpuMetrics[], total: number }
```

### 8.3 대시보드 UI 누락 컴포넌트

1. **LLM Gateway 패널**
   - Enabled/Disabled 토글
   - Gateway 상태 표시
   - Upstream URL 표시
   - 마지막 요청 시간
   - Idle timeout 남은 시간

2. **AK620 제어 패널**
   - 갱신 주기 슬라이더 (1~60초)
   - 현재 갱신 주기 표시

3. **로그 뷰어**
   - 서비스별 로그 필터
   - 시간 범위 필터
   - 로그 레벨 필터

4. **전력 모드 이력**
   - 모드 전환 타임라인
   - 각 모드별 지속 시간

5. **GPU 메트릭 그래프**
   - 온도 시계열 그래프
   - 전력 소비 시계열 그래프
   - VRAM 사용량 시계열 그래프

### 8.4 설정 파일 추가 필드 (선택사항)

```json
{
  "logging": {
    "enabled": true,
    "maxLogEntries": 10000,
    "retentionDays": 7
  },
  "metrics": {
    "enabled": true,
    "collectionIntervalSeconds": 10,
    "maxMetricEntries": 50000
  }
}
```

---

## 9. 파일 위치 요약

| 항목 | 경로 |
|------|------|
| 백엔드 서버 | `apps/backend/src/server.ts` |
| 백엔드 타입 | `apps/backend/src/types.ts` |
| 백엔드 설정 로더 | `apps/backend/src/config.ts` |
| 백엔드 설정 파일 | `apps/backend/config.json` |
| 전력 제어 | `apps/backend/src/power-controller.ts` |
| 시스템 모니터 | `apps/backend/src/system-monitor.ts` |
| 대시보드 UI | `apps/dashboard/index.html` |
| LLM Gateway | `services/llm-gateway/src/index.ts` |
| AK620 Agent | `services/ak620-agent/src/index.ts` |
| AK620 장치 | `services/ak620-agent/src/device.ts` |
| AK620 센서 | `services/ak620-agent/src/sensors.ts` |
| AK620 디스플레이 | `services/ak620-agent/src/display-cycle.ts` |
| AK620 프로토콜 | `services/ak620-agent/src/protocol.ts` |
| AK620 타입 | `services/ak620-agent/src/types.ts` |

---

## 10. 구현 우선순위 (Vantage_PLAN.md 섹션 6.5 & 11.x 기준)

### Phase 1: 백엔드 API 완성 (필수)
1. `GET /api/status` 응답에 `gateway` 필드 추가
2. `GET /api/status` 응답에 `ak620` 필드 완성 (minRefreshInterval, maxRefreshInterval)
3. `POST /api/ak620/refresh-interval` 엔드포인트 추가

### Phase 2: 대시보드 UI 확장 (필수)
1. LLM Gateway 토글 & 상태 표시 패널
2. AK620 갱신 주기 슬라이더
3. GPU 메트릭 요약 (총 전력, 온도 범위)

### Phase 3: 로깅 & 메트릭 (선택)
1. 시스템 로그 수집 & 저장
2. 전력 모드 전환 이력 기록
3. GPU 메트릭 히스토리 수집

### Phase 4: 고급 UI (선택)
1. 로그 뷰어
2. 전력 모드 이력 타임라인
3. GPU 메트릭 그래프

---

## 11. 검증 체크리스트

- [x] 모든 현재 엔드포인트 매핑
- [x] 모든 응답 스키마 문서화
- [x] 설정 필드 완전 나열
- [x] 환경 변수 오버라이드 확인
- [x] 대시보드 UI 컴포넌트 현황 파악
- [x] Vantage_PLAN.md 요구사항 vs 현재 구현 비교
- [x] 누락된 필드 & 엔드포인트 식별
- [x] 필요한 데이터 모델 정의
- [x] 파일 위치 정확히 기록
- [x] 구현 우선순위 제시

---

**보고서 완료**
