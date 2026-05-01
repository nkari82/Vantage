# Vantage 디스플레이 및 저전력 모드 최적화 계획

## Goal
Vantage_PLAN.md의 AK620 디스플레이 갱신 주기를 설정 가능하게 변경하고, 저전력 모드를 GPU 최소 전력 및 시스템 최소 대기전력 중심으로 강화한다.

## Target Files
- `D:\Work\Vantage\Vantage_PLAN.md`

## Root Cause
1. **AK620 디스플레이 갱신 주기**: 하드코딩된 1~2초 주기로 인해 불필요한 전력 소모 및 설정 유연성 부족
2. **저전력 모드**: 현재 100~120W GPU 파워 리밋만으로는 충분하지 않음. GPU를 거의 끄고 시스템 전체를 최소 대기전력으로 운영해야 함

## Implementation Steps

### 1. AK620 디스플레이 갱신 주기 설정 가능화
- **313라인 수정**: `1~2초마다 갱신` → `기본 4초 (설정 가능: 1~60초)`
- **8.4 절 업데이트**: 설정 가능한 갱신 주기 설명 추가
- **8.5 데이터 흐름**: 갱신 주기 설정값 반영
- **8.6 AK620 Agent 구조**: 설정 파일 또는 환경 변수 지원 추가
- **11.5 AK620 UI**: 순환 주기 설정 UI 요구사항 명시 (이미 509라인에 있음)

### 2. 저전력 모드 강화
- **4절 전력 모드 표 업데이트**:
  - Low Power Mode 설명: `100~120W` → `GPU 최소 전력 (50~70W 또는 가능한 최저치)`
  - 추가 설정: CPU governor powersave, 불필요한 서비스 중지, 팬 속도 최소화 등

- **5절 Adaptive Mode LOW_POWER 상태 업데이트**:
  - GPU power limit: `100~120W` → `최소 전력 (50~70W)`
  - 추가 절전 조치 명시

- **새 절 추가 (8.8 또는 17절 이후)**: 저전력 모드 상세 설정
  - GPU: Power limit 최소화, 가능하면 GPU 클럭 최저하
  - CPU: powersave governor, P-states 최적화
  - 시스템: 불필요한 서비스 중지 (예: cron, 로그 회전 등 비필수 서비스)
  - 스토리지: NVMe 전력 절약 모드 (APST 활성화)
  - 네트워크: 불필요한 네트워크 인터페이스 down
  - 팬: 최소 RPM으로 제어
  - LED/RGB: 꺼진 상태 유지

### 3. 설정값 추가 (JSON 설정 예시)
```json
{
  "ak620": {
    "refreshIntervalSeconds": 4,
    "minRefreshInterval": 1,
    "maxRefreshInterval": 60
  },
  "lowPowerMode": {
    "gpuPowerLimitW": 60,
    "cpuGovernor": "powersave",
    "stopServices": ["cron", "unnecessary-daemons"],
    "nvmePowerSave": true,
    "fanMinRpm": true
  }
}
```

## Risks
- 너무 공격적인 절전 모드가 시스템 안정성에 영향 줄 수 있음
- GPU 최소 전력 설정이 하드웨어/드라이버에 따라 다를 수 있음
- 서비스 중지로 인한 기능 제한 가능성

## Validation Checklist
- [ ] AK620 디스플레이 갱신 주기 기본 4초로 변경 확인
- [ ] 갱신 주기 설정 UI 동작 확인
- [ ] 저전력 모드에서 GPU 전력 60W 이하로 감소 확인
- [ ] 저전력 모드에서 불필요한 서비스 중지 확인
- [ ] Adaptive Mode LOW_POWER 전환 시 모든 절전 조치 적용 확인
- [ ] 시스템 안정성 테스트 (저전력 모드 장시간 운영)

## Files to Modify
1. `Vantage_PLAN.md`:
   - 313라인: 갱신 주기 변경
   - 8.4절: 설정 가능 설명 추가
   - 4절: Low Power Mode 설명 업데이트
   - 5절: LOW_POWER 상태 설명 업데이트
   - 새 절 추가: 저전력 모드 상세 설정 (8.8절로 추가 권장)
