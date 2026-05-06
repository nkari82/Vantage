# Vantage 프로젝트 계획서

## 1. 프로젝트 개요

**Vantage**는 듀얼 RTX 3090 기반 로컬 AI 서버를 위한 시스템 운용 플랫폼이다.

목표는 단순한 LLM 실행기가 아니라, 다음을 하나의 웹 대시보드에서 통합 관리하는 것이다.

- 시스템 상태 모니터링
- GPU 전력 모드 제어
- 기본/저전력/표준/아답티브 모드 전환
- LLM Gateway 자동 기동/종료
- LLM Gateway 활성화/비활성화
- vLLM 모델 서버 제어
- AK620 Digital 디스플레이 연동
- 코드 지도 생성/조회 서버 기반 확장

---

## 2. 기준 하드웨어

현재 Vantage가 대상으로 하는 서버 스펙은 다음과 같다.

| 부품 | 모델 |
|---|---|
| CPU | AMD Ryzen 7 5700X |
| GPU | Dell RTX 3090 24GB x2 |
| VRAM | 총 48GB |
| 메인보드 | ASUS TUF GAMING X570-PRO (Wi-Fi) |
| RAM | Corsair Vengeance LPX DDR4 3200 32GB x2, 총 64GB |
| SSD | Samsung 980 NVMe 1TB |
| PSU | FSP Hydro PTM PRO 1200W |
| 케이스 | Lian Li O11 Air Mini |
| CPU 쿨러 | DeepCool AK620 Digital |
| 하단 팬 | ARCTIC P12 Slim x2, 흡기 |
| 상단 팬 | ARCTIC P12 x2, 배기 |
| OS | Ubuntu Server |

---

## 3. 공기 흐름 설계

Vantage 서버의 기준 공기 흐름은 다음과 같다.

```text
상단: 배기  ARCTIC P12 x2
전면: 흡기  O11 Air Mini 기본 140mm x2
후면: 배기  O11 Air Mini 기본 120mm x1
하단: 흡기  ARCTIC P12 Slim x2
CPU 쿨러: 전면 → 후면 방향
GPU: 하단 흡기 공기를 받아 히트싱크 냉각
```

다이어그램:

```text
                ↑ ↑
          상단 배기 x2
      ┌──────────────────┐
      │                  │
전면 →│   CPU →→→ 후면   │→ 배기
흡기  │                  │
      │   RTX 3090       │
      │   RTX 3090       │
      │    ↑      ↑      │
      │  하단 흡기 x2    │
      └──────────────────┘
```

---

## 4. 전력 모드

Vantage는 5가지 주요 운용 모드를 제공한다.

| 모드 | 설명 | GPU Power Limit |
|---|---|---|
| Default Mode | 기본 고성능 운용 모드 | 150W |
| Adaptive Mode | 요청 발생 시 자동 고성능 전환, idle 시 저전력 복귀 | 자동 |
| Low Power Mode | 대시보드/API/DB만 유지, GPU 최소 전력, 시스템 최소 대기전력 | 50~70W (최소) |
| Standard Mode 250 | 조용한 LLM 운용 | 250W |
| Standard Mode 280 | 권장 LLM 운용 | 280W |

사용자는 수동으로 모드를 선택할 수 있고, Adaptive Mode에서는 Vantage가 요청 상태에 따라 자동으로 전환한다.

---

## 5. Adaptive Mode 동작

Adaptive Mode는 버튼을 누르지 않아도 자동으로 동작한다.

```text
평소:
LOW_POWER
- vLLM 중지
- GPU power limit 50~70W (최소 전력)
- CPU governor powersave
- 불필요한 서비스 중지
- 팬 속도 최소화
- Dashboard/API/DB 유지

요청 발생:
STANDARD_280
- GPU power limit 280W
- CPU governor performance
- vLLM 자동 시작
- 모델 로딩

idle timeout:
LOW_POWER 복귀
- vLLM 자동 종료
- GPU power limit 50~70W (최소 전력)
- CPU powersave
- 불필요한 서비스 중지
- 팬 속도 최소화
```

기본 idle timeout은 20~30분을 권장한다.

---

## 6. LLM Gateway

### 6.1 역할

LLM Gateway는 OpenAI 호환 API 요청을 받아 vLLM으로 전달하는 중간 계층이다.

```text
Client / React Dashboard / Code Agent
        ↓
Vantage LLM Gateway
        ↓
vLLM
        ↓
RTX 3090 x2
```

### 6.2 핵심 기능

- LLM 요청 감지
- vLLM 실행 여부 확인
- vLLM 미실행 시 자동 시작
- GPU Power Limit 자동 변경
- CPU governor 자동 변경
- idle timeout 후 vLLM 종료
- OpenAI-compatible API proxy

### 6.3 활성화/비활성화 기능

LLM Gateway는 반드시 항상 켜져 있어야 하는 기능이 아니다.  
Vantage에서는 Gateway 기능을 **활성화/비활성화**할 수 있어야 한다.

#### Gateway Enabled

```text
클라이언트 요청 → Vantage Gateway → vLLM 자동 기동/프록시
```

효과:

- Adaptive Mode 완전 자동화
- 요청 시 자동 LLM 시작
- idle 시 자동 종료
- 전력 최적화 가능

#### Gateway Disabled

```text
클라이언트 요청 → vLLM 직접 접근
또는
LLM 기능 비활성 상태
```

효과:

- Gateway가 vLLM 요청을 가로채지 않음
- 사용자가 직접 vLLM을 수동 운영 가능
- 디버깅 또는 순수 시스템 모니터링 서버로 사용 가능
- Gateway 장애가 전체 시스템에 영향을 주지 않음

### 6.4 Gateway 설정값

```json
{
  "llmGateway": {
    "enabled": true,
    "upstreamUrl": "http://127.0.0.1:8000",
    "listenPort": 8080,
    "idleTimeoutMinutes": 30,
    "autoStartVllm": true,
    "autoStopVllm": true,
    "activePowerMode": "STANDARD_280",
    "idlePowerMode": "LOW_POWER"
  }
}
```

### 6.5 UI 요구사항

대시보드에는 다음 항목이 필요하다.

```text
[LLM Gateway]
- Enabled / Disabled 토글
- Gateway 상태
- vLLM 상태
- Upstream URL
- 마지막 요청 시간
- idle timeout 남은 시간
- 수동 vLLM 시작/중지 버튼
```

---

## 7. vLLM 운용 기준

기본 메인 모델은 32B~35B 코딩 모델을 기준으로 한다.

예시:

```bash
export CUDA_VISIBLE_DEVICES=0,1
export VLLM_USE_FLASHINFER_SAMPLER=1
export VLLM_ENABLE_CUDAGRAPH_GC=1

vllm serve Lorbus/Qwen3.6-27B-int4-AutoRound \
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
```

권장 운영:

```text
35B 단일 모델:
- GPU0 + GPU1 사용
- tensor_parallel_size=2
- gpu-memory-utilization 0.75~0.82

35B + 8B 동시 운용:
- 안정성 우선이면 GPU 분리
- 35B가 두 GPU를 모두 잡는 상태에서 8B를 추가로 올리는 것은 OOM 위험 있음
```

NVLink는 필수로 보지 않는다.

```text
NVLink:
- GPU 간 통신에는 일부 도움
- 48GB 단일 VRAM처럼 완전 통합되지는 않음
- 35B + 8B 안정화 목적에는 큰 의미 없음
```

---

## 8. AK620 Digital 연동

### 8.1 목표

DeepCool AK620 Digital 디스플레이를 Vantage의 물리 상태 표시기로 사용한다.

표시 대상:

```text
CPU 온도
GPU0 온도
GPU1 온도
```

### 8.2 장치 정보

AK620 Digital 장치 식별자는 다음을 사용한다.

```ts
const vendorId = 0x3633;
const productId = 0x0002;
```

참고 구현:

```text
https://github.com/Algorithm0/deepcool-digital-info/blob/main/deepcool-digital-info.py
```

이 Python 구현을 참고하여 Node.js TypeScript 기반 `node-hid` 구현으로 포팅한다.

### 8.3 표시 규칙

AK620 디스플레이의 바 표시를 상태 식별자로 사용한다.

```text
바 1개 ON → CPU 표시
바 2개 ON → GPU0 표시
바 3개 ON → GPU1 표시
```

표시 예시:

```text
[■□□] CPU 52°C
[■■□] GPU0 71°C
[■■■] GPU1 68°C
```

### 8.4 순환 표시 모드

기본 동작은 순환 표시다.

```text
CPU → GPU0 → GPU1 → CPU → ...
```

권장 주기:

```text
기본 4초 (설정 가능: 1~60초)
```

### 8.4.1 갱신 주기 설정
AK620 디스플레이 갱신 주기는 사용자가 설정할 수 있다.

설정 방법:
- **환경 변수**: `AK620_REFRESH_INTERVAL=4` (초 단위)
- **설정 파일**: `config.json` 내 `ak620.refreshIntervalSeconds`
- **UI**: 대시보드 AK620 패널에서 슬라이더 또는 입력 필드로 조정

유효 범위: 1초(최고속) ~ 60초(최저속)
저전력 모드에서는 자동으로 8초 이상 권장된다.

### 8.5 데이터 흐름

```text
lm-sensors / nvidia-smi
        ↓
Vantage Backend
        ↓
AK620 Agent
        ↓
node-hid
        ↓
AK620 Digital
```

### 8.6 AK620 Agent 구조

```text
services/ak620-agent/
├─ device.ts          # HID 장치 탐색/연결
├─ protocol.ts        # DeepCool 패킷 생성
├─ sensors.ts         # CPU/GPU 온도 수집
├─ display-cycle.ts   # CPU/GPU0/GPU1 순환 표시
└─ index.ts           # Agent 실행 진입점
```

### 8.7 Linux 권한

Ubuntu Server에서는 HID 접근 권한 처리가 필요하다.

udev rule 예시:

```text
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3633", ATTRS{idProduct}=="0002", MODE="0666"
```

적용:

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### 8.8 저전력 모드 상세 설정

Low Power Mode에서는 GPU를 거의 끄고 시스템 전체를 최소 대기전력으로 운영한다.

**GPU 설정:**
- Power limit 50~70W (하드웨어 최소치)
- 가능하면 GPU 클럭 최저하

**CPU 설정:**
- governor: powersave
- P-states 최적화

**시스템 설정:**
- 불필요한 서비스 중지 (cron, 로그 회전 등 비필수 서비스)
- NVMe 전력 절약 모드 (APST 활성화)
- 불필요한 네트워크 인터페이스 down
- 팬 속도 최소 RPM으로 제어
- LED/RGB 꺼진 상태 유지

---

## 9. Vantage 전체 아키텍처

```text
React Dashboard
        ↓
Node.js TypeScript Backend
        ↓
┌──────────────────────────────────┐
│ Vantage Core                     │
│                                  │
│ - Power Mode Controller          │
│ - Adaptive Engine                │
│ - LLM Gateway                    │
│ - System Monitor                 │
│ - GPU Monitor                    │
│ - AK620 Agent Bridge             │
└──────────────────────────────────┘
        ↓
systemd / nvidia-smi / sensors / node-hid / vLLM
        ↓
Hardware
```

---

## 10. 백엔드 API 설계

### 10.1 System Status

```http
GET /api/status
```

응답:

```json
{
  "mode": "ADAPTIVE",
  "llmGatewayEnabled": true,
  "llmReady": true,
  "lastUsedAt": 1730000000000,
  "gpus": [
    {
      "index": 0,
      "temperatureC": 70,
      "powerW": 244,
      "powerLimitW": 280,
      "memoryUsedMiB": 21000,
      "memoryTotalMiB": 24576
    }
  ]
}
```

### 10.2 Power Mode 변경

```http
POST /api/mode
```

Body:

```json
{
  "mode": "STANDARD_280"
}
```

### 10.3 LLM Gateway 토글

```http
POST /api/llm-gateway/enabled
```

Body:

```json
{
  "enabled": true
}
```

### 10.4 vLLM 수동 제어

```http
POST /api/llm/start
POST /api/llm/stop
```

### 10.5 AK620 상태

```http
GET /api/ak620/status
```

응답:

```json
{
  "connected": true,
  "currentTarget": "GPU0",
  "barLevel": 2,
  "temperatureC": 71
}
```

---

## 11. 프론트엔드 UI 설계

### 11.1 Overview

- 현재 모드
- 총 GPU 전력
- LLM 상태
- Gateway 상태
- CPU/GPU 온도 요약

### 11.2 Power

- Adaptive Mode
- Low Power Mode
- Standard 250
- Standard 280
- Default
- 현재 power limit 표시

### 11.3 LLM Gateway

- Gateway Enabled / Disabled 토글
- vLLM Running / Stopped
- 마지막 요청 시간
- idle timeout 표시
- 수동 Start/Stop

### 11.4 GPU

- GPU0/GPU1 온도
- VRAM 사용량
- Power Draw
- Power Limit
- Utilization

### 11.5 AK620

- 연결 상태
- 현재 표시 대상
- 현재 온도
- 바 표시 상태
- 순환 주기 설정

### 11.6 Logs

- systemd 로그
- vLLM 로그
- Gateway 로그
- Power Mode 전환 이력
- AK620 Agent 로그

---

## 12. 폴더 구조

```text
vantage/
├─ apps/
│  ├─ dashboard/
│  └─ backend/
│
├─ services/
│  ├─ adaptive-engine/
│  ├─ llm-gateway/
│  ├─ system-agent/
│  └─ ak620-agent/
│
├─ services/
│  ├─ linux/
│  │  ├─ vantage-backend.service
│  │  ├─ vantage-ak620-agent.service
│  │  └─ vllm-coder.service
│  └─ windows/
│     ├─ vantage-backend.ps1
│     └─ vllm-coder.ps1
│
├─ docs/
│  ├─ HARDWARE.md
│  ├─ AIRFLOW.md
│  ├─ BIOS.md
│  ├─ POWER_MODES.md
│  ├─ LLM_GATEWAY.md
│  ├─ AK620.md
│  └─ ROADMAP.md
│
└─ README.md
```

---

## 13. systemd 서비스

### 13.1 vantage-backend.service

항상 실행된다.

역할:

```text
- API 제공
- Dashboard 데이터 제공
- Power Mode 제어
- LLM Gateway 제어
- AK620 Agent와 통신
```

### 13.2 vllm-coder.service

항상 실행되며, 시스템 리부팅 후에도 자동 시작되어야 한다.

```text
- 기본적으로 항상 실행 (부팅 시 자동 시작)
- 필요 시 Gateway가 요청을 프록시
- 운영 정책에 따라 idle 시 내부 모델 unload/절전 전환 가능
```

### 13.3 vantage-ak620-agent.service

항상 실행되며, 시스템 리부팅 후에도 자동 시작되어야 한다.

```text
- AK620 Digital 업데이트
- CPU/GPU 온도 순환 표시
```

---

## 14. 보안 정책

Vantage는 시스템 전력과 서비스를 직접 제어하므로 권한 관리가 중요하다.

### 14.1 sudo 권한 제한

`visudo`에는 필요한 명령만 허용한다.

```text
vantage ALL=(root) NOPASSWD: /usr/local/bin/vantage-power-low.sh
vantage ALL=(root) NOPASSWD: /usr/local/bin/vantage-power-standard-250.sh
vantage ALL=(root) NOPASSWD: /usr/local/bin/vantage-power-standard-280.sh
# legacy turbo sudo entry removed; DEFAULT mode is now the primary high-performance mode
vantage ALL=(root) NOPASSWD: /bin/systemctl start vllm-coder.service
vantage ALL=(root) NOPASSWD: /bin/systemctl stop vllm-coder.service
```

### 14.2 네트워크

권장:

```text
- 내부망 전용
- Tailscale/VPN 사용
- 외부 포트 직접 공개 금지
```

---

## 15. 개발 우선순위

### Phase 1. Core

- 프로젝트 이름 Vantage 적용
- Backend API
- GPU 상태 수집
- Power Mode 스크립트
- React Dashboard 기본 화면

### Phase 2. LLM

- vLLM systemd 등록
- LLM Gateway 구현
- Gateway 활성화/비활성화 기능
- Adaptive Mode 구현
- idle timeout 구현

### Phase 3. AK620

- `node-hid` 기반 장치 연결
- vendorId/productId 고정
- Python 원본 프로토콜 TypeScript 포팅
- CPU/GPU0/GPU1 온도 순환 표시
- 바 1/2/3개 규칙 구현

### Phase 4. Observability

- 로그 UI
- 전력 모드 전환 기록
- GPU 온도 그래프
- VRAM 사용량 그래프

### Phase 5. Code Map

- GPU 사용 코드 지도 생성
- 저전력 모드 코드 지도 조회
- 프로젝트별 인덱싱
- 함수/클래스/파일 관계 검색

---

## 16. 핵심 설계 원칙

```text
1. Dashboard는 항상 실행된다.
2. LLM은 필요할 때만 실행된다.
3. GPU는 필요할 때만 고전력으로 전환한다.
4. Gateway는 활성화/비활성화 가능해야 한다.
5. AK620은 보조 물리 디스플레이로 사용한다.
6. 시스템 안정성이 성능보다 우선이다.
7. Default Mode가 기본 고성능 수동 모드를 담당한다.
8. Vantage 핵심 서비스는 항상 켜져 있어야 하며, 리부팅 후 자동 복구되어야 한다.
```

---

## 17. 최종 정의

**Vantage는 로컬 AI 서버를 위한 시스템 운용 대시보드이다.**

이 프로젝트의 핵심은 다음 한 문장으로 정의된다.

> Vantage는 듀얼 RTX 3090 서버를 저전력 홈서버와 고성능 LLM 서버 사이에서 자동 전환하고, 그 상태를 웹 대시보드와 AK620 Digital 물리 디스플레이로 동시에 보여주는 운영 플랫폼이다.
