# Phase 2 Plan: ADAPTIVE 모드 Steam Cloud 연동 + LLM 큐잉/재개

## TL;DR

> **Quick Summary**: ADAPTIVE 모드에서만 Steam Cloud 세션 시작/종료 이벤트를 받아, 세션 중에는 LLM 요청을 파일 영속 큐에 적재하고 vLLM을 내리며, 세션 종료 시 vLLM 재기동 후 큐를 FIFO로 재처리한다.
>
> **Deliverables**:
> - Backend Steam session API + 상태 모델
> - LLM Gateway 202+jobId 큐잉/조회/재생 파이프라인
> - 상태 노출(/api/status, queue status) 및 운영 검증 시나리오
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves + Final verification wave
> **Critical Path**: T1 → T4 → T9 → T12 → F1/F2/F3/F4

---

## Context

### Original Request
- “2차 구현계획이고 스팀클라우드 같이 구현하고 싶어 전력제한은 이 때 디펄트값으로 돌려놓고 실행중인 llm이 있다면 큐에 쌓아놓고 llm 서비스를 내려. 스팀클라우드에 다시 접속하면 큐에 쌓아놓는 llm을 재가동 시키는거지”
- 추가 확인: **“참고로 아답티브 모드일 경우야”**

### Interview Summary
**Key Decisions (확정):**
- 배포 토폴로지: **Ubuntu 서버 호스트에서 Steam 실행**, 원격 PC는 해당 호스트로 스트리밍
- Steam session 트리거 시점: **스트리밍 세션 시작 시점**(원격 접속 시작 즉시 `session-start` 호출)
- ADAPTIVE 모드 한정 적용
- Steam 시작 시 복귀 전력 정책: `llmGateway.idlePowerMode` 사용
- 큐 처리 방식: `202 + jobId` 모델
- 큐 내구성: 파일 영속 큐
- Steam 이벤트 입력: 외부 호출자가 backend API 호출

### Research Findings
- 전력 모드 제어: `app/src/server/api/power.ts`, `app/src/server/power-controller.ts`, `app/src/server/platforms/linux.ts`
- LLM 제어: `app/src/server/api/llm.ts` (`/api/llm/start`, `/api/llm/stop`, `/api/llm/touch`)
- 게이트웨이 단일 진입점: `services/llm-gateway/src/index.ts` 의 `app.use('/v1', ...)`
- Steam connect/disconnect 직접 감지 로직은 현재 없음

### Metis Review (반영 요약)
- 반영된 guardrail: 비-ADAPTIVE 로직/동작 불변, Steam SDK 직접 연동 금지, 본 phase에서 대시보드 UI 변경 금지
- 반영된 리스크 처리: 큐 용량 제한, TTL, 헬스체크 기반 replay 시작, idempotency key 선택 지원
- 남은 critical decision: queue overflow 정책(권장: 503 reject)

---

## Work Objectives

### Core Objective
ADAPTIVE 모드에서 Steam session lifecycle과 LLM lifecycle을 안전하게 오케스트레이션하여 게임 세션 중 전력/서비스 간섭을 줄이고, 세션 후 LLM 작업을 유실 없이 재개한다.

### Concrete Deliverables
- 신규 Steam session API (start/end/status) 및 상태 저장
- 파일 영속 큐(`steam-queue.json`) + job status 조회 API
- LLM Gateway queue gate + replay worker(FIFO)
- `/api/status` 확장(steam session/queue summary)

### Definition of Done
- [ ] ADAPTIVE + session start에서 `idlePowerMode` 전환 + vLLM stop 성공
- [ ] session active 동안 `/v1/*` 요청이 202 + jobId로 큐 적재
- [ ] session end에서 vLLM start + 큐 FIFO 재생
- [ ] queue 데이터가 프로세스 재시작 후 복구됨
- [ ] 비-ADAPTIVE에서 session start/end는 명시적 거부(409)

### Must Have
- ADAPTIVE guard 강제
- 파일 영속 큐 + 상태 조회
- replay 전 vLLM health check
- 실패 job 격리(다음 job 계속 처리)

### Must NOT Have (Guardrails)
- 비-ADAPTIVE 경로의 기존 동작 변경 금지
- Steam SDK/직접 감지 로직 도입 금지(외부 이벤트 API만)
- 기존 `/api/llm/start|stop|touch` 계약 파괴 금지
- Phase 2에서 dashboard 대규모 UI 작업 금지

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - 모든 검증은 에이전트가 실행

### Test Decision
- **Infrastructure exists**: YES (TypeScript 빌드 스크립트 존재)
- **Automated tests**: YES (Tests-after)
- **Framework**: Node test 또는 프로젝트 표준 선택(추가)

### QA Policy
- API: curl 기반 상태/응답 검증
- Gateway: curl로 `/v1/*` 호출 후 202/jobId/상태 폴링 검증
- System: service start/stop과 health endpoint 검증

### Headless 디스플레이 사전 점검 체크리스트 (Ubuntu + NVIDIA)

> 목적: **호스트 GPU에 물리 모니터가 없어도** Steam 게임 실행/스트리밍 경로가 성립하는지 사전에 검증

- [ ] NVIDIA 드라이버/장치 인식 확인
  - Command: `nvidia-smi`
  - Expected: GPU 목록/드라이버 버전이 정상 출력

- [ ] 세션 타입 및 디스플레이 변수 확인
  - Command: `echo $XDG_SESSION_TYPE; echo $DISPLAY; loginctl show-session $(loginctl | awk '/tty|seat|pts/ {print $1; exit}') -p Type -p Name -p State`
  - Expected: 실행 사용자 세션이 active이며, X11/Wayland 세션 정보 확인 가능

- [ ] Sunshine 서비스 상태 확인
  - Command: `systemctl status sunshine --no-pager`
  - Expected: `active (running)`

- [ ] Sunshine 접속 후 가상/헤드리스 출력 생성 여부 확인
  - Command: `xrandr --query` (X11) 또는 `weston-info`/compositor별 출력 조회 명령
  - Expected: 연결 가능한 출력(가상 포함) 1개 이상 확인

- [ ] Steam Big Picture/게임 실행 smoke test
  - Command: (원격 접속 상태에서) Steam 실행 후 테스트 게임 1개 기동
  - Expected: 원격 화면에서 라이브러리/게임 선택 및 실제 렌더링 확인

**실패 시 Fallback 순서 (Runbook 고정):**
1. Sunshine headless/virtual display 설정 재적용 및 서비스 재시작
2. NVIDIA/Xorg 세션 재초기화(로그아웃/재로그인 또는 display manager 재기동)
3. **HDMI dummy plug 장착** 후 동일 체크리스트 재검증

### Default Runtime Constraints (Applied)
- Queue max size: 50
- Job TTL: 30min
- Queue path: `app/data/steam-queue.json` (backend canonical), gateway side mirror as needed
- Replay start health check: 5s 간격 x 3회
- Session watchdog timeout: 6h
- Overflow policy: 503 reject (CRITICAL decision required if override)

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Foundation - 병렬 시작 가능):
- T1 타입/설정 스키마 확장
- T2 Steam session 상태 저장소(backend)
- T3 Queue 데이터 모델/파일 저장 유틸
- T4 Gateway queue core 구조(메모리+파일 로더)
- T5 공통 에러 코드/응답 포맷 정리

Wave 2 (API & Gate control):
- T6 backend Steam session API(start/end/status)
- T7 `/api/status` steam/queue summary 확장
- T8 gateway `/v1` queue gate(ADAPTIVE+session active 시 202)
- T9 job status/result API
- T10 idempotency-key dedupe(optional but recommended)

Wave 3 (Replay & Orchestration):
- T11 replay worker(FIFO, 실패 격리)
- T12 session-end trigger에서 vLLM start + replay kickoff
- T13 health check/warmup gate 구현
- T14 watchdog/timeout 복구 처리

Wave 4 (Hardening & Observability):
- T15 재시작 복구 테스트(backend/gateway)
- T16 큐 overflow/TTL 청소 작업
- T17 운영 로그/메트릭 포인트 추가
- T18 문서 및 runbook(phase2 운영 가이드)

Wave FINAL:
- F1 Plan compliance audit (oracle)
- F2 Code quality review
- F3 End-to-end real QA execution
- F4 Scope fidelity check

---

## TODOs

- [ ] 1. Steam/Queue 타입 계약 추가 (`app/src/shared/types.ts`)

  **What to do**:
  - `SystemStatus`에 `steamSessionActive`, `steamSessionStartedAt`, `queueSummary {queued, processing, completed, failed}` 추가
  - Steam API 응답 타입(`SteamSessionStartResponse`, `SteamSessionEndResponse`, `QueueJobStatus`) 추가

  **References**:
  - `app/src/shared/types.ts`
  - `app/src/server/server.ts` (`/api/status` 응답 생성부)

  **Acceptance Criteria**:
  - [ ] 타입 빌드 성공: `npm run build:server -w app`

  **QA Scenarios**:
  - Scenario: 타입 컴파일 성공
    - Tool: Bash
    - Steps: `npm run build:server -w app`
    - Expected: exit code 0
    - Evidence: `.sisyphus/evidence/task-1-types-build.txt`
  - Scenario: 누락 필드 컴파일 실패 방지
    - Tool: Bash
    - Steps: 서버 코드에서 `/api/status`가 신규 필드를 포함한 채 빌드
    - Expected: TS 에러 0건
    - Evidence: `.sisyphus/evidence/task-1-types-status.txt`

- [ ] 2. Backend Steam 세션 상태 저장소 구현

  **What to do**:
  - 메모리 상태 + 파일 스냅샷(`app/data/steam-session.json`) 저장/복구 유틸 추가
  - idempotent start/end 전이 규칙 구현

  **References**:
  - `app/src/server/server.ts` (state 관리 패턴)
  - `app/data/` (런타임 데이터 경로)

  **Acceptance Criteria**:
  - [ ] 재시작 후 session active 상태 복구

  **QA Scenarios**:
  - Scenario: 상태 저장/재기동 복구
    - Tool: Bash
    - Steps: session-start 호출 → 프로세스 재시작 → status 조회
    - Expected: `steamSessionActive=true` 유지
    - Evidence: `.sisyphus/evidence/task-2-session-recover.txt`
  - Scenario: end 없이 중복 start
    - Tool: Bash
    - Steps: start 2회 연속 호출
    - Expected: 2회 모두 안전 처리(200 또는 정의된 idempotent 응답)
    - Evidence: `.sisyphus/evidence/task-2-idempotent-start.txt`

- [ ] 3. 파일 영속 큐 모델/저장 유틸 구현

  **What to do**:
  - 큐 파일 `app/data/steam-queue.json` 생성/복구
  - job schema: `jobId`, `createdAt`, `status`, `requestSnapshot`, `resultSnapshot`, `error`
  - TTL(30min) 및 max size(50) 정책 구현

  **Acceptance Criteria**:
  - [ ] 큐 push/pop/상태변경/TTL purge 동작

  **QA Scenarios**:
  - Scenario: 큐 적재/조회
    - Tool: Bash
    - Steps: 테스트 요청 3건 적재 후 파일/상태 조회
    - Expected: queued=3
    - Evidence: `.sisyphus/evidence/task-3-queue-enqueue.txt`
  - Scenario: overflow
    - Tool: Bash
    - Steps: 51번째 요청 적재
    - Expected: 503 + overflow 코드
    - Evidence: `.sisyphus/evidence/task-3-overflow-503.txt`

- [ ] 4. Gateway 큐 코어(로더/세이버) 추가

  **What to do**:
  - `services/llm-gateway/src/index.ts`에 큐 로드/flush 유틸 추가
  - 프로세스 시작 시 파일 큐 자동 복구

  **Acceptance Criteria**:
  - [ ] gateway 재시작 후 queued 카운트 유지

  **QA Scenarios**:
  - Scenario: gateway 재시작 복구
    - Tool: Bash
    - Steps: queue 적재 → gateway 재시작 → queue status 조회
    - Expected: count 동일
    - Evidence: `.sisyphus/evidence/task-4-gateway-recover.txt`
  - Scenario: 큐 파일 손상
    - Tool: Bash
    - Steps: 의도적 malformed JSON
    - Expected: graceful fallback + 에러로그 + 프로세스 유지
    - Evidence: `.sisyphus/evidence/task-4-corrupt-file.txt`

- [ ] 5. 공통 에러 코드/응답 포맷 정의

  **What to do**:
  - `STEAM_NOT_ADAPTIVE`, `QUEUE_OVERFLOW`, `SESSION_NOT_ACTIVE`, `VLLM_NOT_READY` 코드 정의
  - API 응답 `{ok:false,errorCode,message}` 일관화

  **Acceptance Criteria**:
  - [ ] start/end/queue API가 통일된 에러 포맷 반환

  **QA Scenarios**:
  - Scenario: 비-ADAPTIVE start
    - Tool: Bash (curl)
    - Steps: mode=STANDARD_250 상태에서 `POST /api/steam/session/start`
    - Expected: 409 + `STEAM_NOT_ADAPTIVE`
    - Evidence: `.sisyphus/evidence/task-5-not-adaptive.txt`
  - Scenario: session-end without start
    - Tool: Bash (curl)
    - Steps: `POST /api/steam/session/end`
    - Expected: 409 + `SESSION_NOT_ACTIVE` (또는 명시된 no-op)
    - Evidence: `.sisyphus/evidence/task-5-end-no-session.txt`

- [ ] 6. Backend Steam API 추가 (`/api/steam/session/start|end|status`)

  **What to do**:
  - start: ADAPTIVE guard 확인 → `idlePowerMode` 적용 → vLLM stop → session active set
  - end: ADAPTIVE guard 확인 → session inactive set → vLLM start trigger
  - status: session/queue summary 반환

  **References**:
  - `app/src/server/api/llm.ts`
  - `app/src/server/api/power.ts`
  - `app/src/server/server.ts`

  **Acceptance Criteria**:
  - [ ] start/end/status API 라우팅 및 인증 정상

  **QA Scenarios**:
  - Scenario: start 성공
    - Tool: Bash (curl)
    - Steps: mode=ADAPTIVE 설정 후 `POST /api/steam/session/start`
    - Expected: 200, `steamSessionActive=true`
    - Evidence: `.sisyphus/evidence/task-6-start-200.txt`
  - Scenario: end 성공
    - Tool: Bash (curl)
    - Steps: active 세션에서 `POST /api/steam/session/end`
    - Expected: 200, `steamSessionActive=false`
    - Evidence: `.sisyphus/evidence/task-6-end-200.txt`

- [ ] 7. `/api/status` steam/queue summary 확장

  **What to do**:
  - 기존 status payload에 steam + queue 요약 반영
  - backward compatibility 유지(기존 필드 불변)

  **Acceptance Criteria**:
  - [ ] 기존 클라이언트 필드 파손 없음

  **QA Scenarios**:
  - Scenario: 상태 필드 존재
    - Tool: Bash (curl + jq)
    - Steps: `/api/status` 조회
    - Expected: `steamSessionActive`, `queueSummary.queued` 존재
    - Evidence: `.sisyphus/evidence/task-7-status-fields.json`
  - Scenario: 기존 필드 유지
    - Tool: Bash (curl + jq)
    - Steps: 기존 `mode`, `gateway`, `ak620` 필드 검증
    - Expected: 모두 존재
    - Evidence: `.sisyphus/evidence/task-7-status-backcompat.json`

- [ ] 8. Gateway `/v1` queue gate 구현

  **What to do**:
  - session active면 upstream 프록시 대신 queue enqueue 후 `202 + jobId` 반환
  - session inactive면 기존 경로 유지(`postBackend('/api/llm/start')`, touch, proxy)

  **References**:
  - `services/llm-gateway/src/index.ts` (110-125행 부근)

  **Acceptance Criteria**:
  - [ ] active 시 무조건 202/jobId

  **QA Scenarios**:
  - Scenario: active 세션에서 큐 적재
    - Tool: Bash (curl)
    - Steps: start 세션 후 `/v1/chat/completions` 호출
    - Expected: HTTP 202 + `jobId`
    - Evidence: `.sisyphus/evidence/task-8-v1-202.json`
  - Scenario: inactive 세션에서 기존 프록시
    - Tool: Bash (curl)
    - Steps: end 세션 후 `/v1/chat/completions` 호출
    - Expected: upstream 응답(202 아님)
    - Evidence: `.sisyphus/evidence/task-8-v1-proxy.txt`

- [ ] 9. Job status/result API 구현

  **What to do**:
  - `GET /api/steam/queue/:jobId` 상태 조회
  - `GET /api/steam/queue/:jobId/result` 결과 조회(completed only)

  **Acceptance Criteria**:
  - [ ] queued/processing/completed/failed 상태 전이 노출

  **QA Scenarios**:
  - Scenario: 상태 전이 조회
    - Tool: Bash (curl)
    - Steps: job 생성→poll status
    - Expected: queued→processing→completed
    - Evidence: `.sisyphus/evidence/task-9-job-status.txt`
  - Scenario: 완료 전 result 요청
    - Tool: Bash (curl)
    - Steps: 즉시 `/result` 호출
    - Expected: 409/425 + 적절 에러코드
    - Evidence: `.sisyphus/evidence/task-9-result-too-early.txt`

- [ ] 10. idempotency-key dedupe 추가

  **What to do**:
  - 동일 `Idempotency-Key` + 동일 payload 조합이면 기존 jobId 반환

  **Acceptance Criteria**:
  - [ ] 중복 요청 2회가 단일 job으로 수렴

  **QA Scenarios**:
  - Scenario: dedupe hit
    - Tool: Bash (curl)
    - Steps: 동일 키/동일 바디 2회 요청
    - Expected: 같은 `jobId`
    - Evidence: `.sisyphus/evidence/task-10-dedupe-hit.txt`
  - Scenario: 동일 키/다른 바디
    - Tool: Bash (curl)
    - Steps: body 변경 후 재요청
    - Expected: 409 또는 신규 job 정책 중 정의된 값
    - Evidence: `.sisyphus/evidence/task-10-dedupe-conflict.txt`

- [ ] 11. Replay worker(FIFO, 실패 격리) 구현

  **What to do**:
  - session end 이후 큐를 FIFO로 처리
  - 개별 실패는 failed 마킹 후 다음 job 진행

  **Acceptance Criteria**:
  - [ ] 10개 중 1개 실패해도 나머지 처리 진행

  **QA Scenarios**:
  - Scenario: FIFO 순서 보장
    - Tool: Bash
    - Steps: A,B,C enqueue 후 replay
    - Expected: 처리 순서 A→B→C
    - Evidence: `.sisyphus/evidence/task-11-fifo-order.txt`
  - Scenario: 중간 실패 격리
    - Tool: Bash
    - Steps: B를 실패 유도
    - Expected: A completed, B failed, C completed
    - Evidence: `.sisyphus/evidence/task-11-failure-isolation.txt`

- [ ] 12. Session-end 오케스트레이션(vLLM start + replay kickoff)

  **What to do**:
  - end API 처리에서 vLLM 준비 완료 후 replay 시작
  - replay 중복 실행 방지 락 추가

  **Acceptance Criteria**:
  - [ ] end 호출 1회로 replay 자동 시작

  **QA Scenarios**:
  - Scenario: end 트리거로 자동 재개
    - Tool: Bash (curl)
    - Steps: active 중 3건 enqueue 후 end 호출
    - Expected: queued=0, completed=3
    - Evidence: `.sisyphus/evidence/task-12-end-kickoff.txt`
  - Scenario: 중복 end 호출
    - Tool: Bash (curl)
    - Steps: end 2회 연속
    - Expected: replay worker 단일 실행
    - Evidence: `.sisyphus/evidence/task-12-double-end-lock.txt`

- [ ] 13. vLLM health check/warmup gate

  **What to do**:
  - replay 전 `/health` 또는 upstream readiness 확인(5s x3)
  - 불가 시 `VLLM_NOT_READY`로 retry/backoff

  **Acceptance Criteria**:
  - [ ] 미준비 상태에서 즉시 replay 시작하지 않음

  **QA Scenarios**:
  - Scenario: warmup 지연 처리
    - Tool: Bash
    - Steps: vLLM 늦게 기동되도록 구성 후 end 호출
    - Expected: health ready 후 replay 시작
    - Evidence: `.sisyphus/evidence/task-13-warmup-delay.txt`
  - Scenario: readiness 실패
    - Tool: Bash
    - Steps: vLLM down 유지
    - Expected: retry 후 failed/paused 상태 명확화
    - Evidence: `.sisyphus/evidence/task-13-not-ready.txt`

- [ ] 14. Session watchdog/timeout 복구 처리(6h)

  **What to do**:
  - start 후 end 이벤트 누락 대비 watchdog로 강제 recovery 경로 제공

  **Acceptance Criteria**:
  - [ ] timeout 도달 시 session active 해제 + 안전 상태 전환

  **QA Scenarios**:
  - Scenario: timeout auto recovery
    - Tool: Bash
    - Steps: 짧은 timeout 테스트 설정 후 대기
    - Expected: active=false, 상태 로그 기록
    - Evidence: `.sisyphus/evidence/task-14-timeout-recover.txt`
  - Scenario: timeout 직전 end 호출
    - Tool: Bash
    - Steps: 경계 시점 end
    - Expected: race-condition 없이 단일 최종 상태
    - Evidence: `.sisyphus/evidence/task-14-race-end.txt`

- [ ] 15. 재시작 복구 E2E 테스트

  **What to do**:
  - backend/gateway 각각 재시작 시 queue/session 복구 시나리오 자동 검증

  **Acceptance Criteria**:
  - [ ] 두 프로세스 순차 재시작에서도 job 유실 없음

  **QA Scenarios**:
  - Scenario: backend 먼저 재시작
    - Tool: Bash
    - Steps: enqueue 후 backend restart
    - Expected: queue count 유지
    - Evidence: `.sisyphus/evidence/task-15-backend-restart.txt`
  - Scenario: gateway 먼저 재시작
    - Tool: Bash
    - Steps: enqueue 후 gateway restart
    - Expected: queue count 유지 및 replay 가능
    - Evidence: `.sisyphus/evidence/task-15-gateway-restart.txt`

- [ ] 16. TTL purge + overflow 정리

  **What to do**:
  - 만료 작업 purge 크론/루프 구현
  - overflow는 확정 정책대로 503 reject

  **Acceptance Criteria**:
  - [ ] 만료 job 자동 삭제 + overflow 시 reject

  **QA Scenarios**:
  - Scenario: TTL 만료 삭제
    - Tool: Bash
    - Steps: 짧은 TTL로 job 생성 후 경과
    - Expected: status에서 제거
    - Evidence: `.sisyphus/evidence/task-16-ttl-purge.txt`
  - Scenario: overflow 고정 정책
    - Tool: Bash
    - Steps: max+1 enqueue
    - Expected: HTTP 503 확정
    - Evidence: `.sisyphus/evidence/task-16-overflow-503.txt`

- [ ] 17. 운영 로그/메트릭 포인트 추가

  **What to do**:
  - session start/end, enqueue/dequeue, replay 결과 로깅
  - queue depth, replay latency 메트릭 수집

  **Acceptance Criteria**:
  - [ ] 주요 전이 이벤트가 로그에서 추적 가능

  **QA Scenarios**:
  - Scenario: 로그 추적성
    - Tool: Bash (journalctl 또는 앱 로그)
    - Steps: start→enqueue→end→replay 수행
    - Expected: 각 이벤트 로그 존재
    - Evidence: `.sisyphus/evidence/task-17-log-trace.txt`
  - Scenario: 메트릭 값 증가
    - Tool: Bash
    - Steps: replay 실행 후 메트릭 조회
    - Expected: replay count/latency 기록
    - Evidence: `.sisyphus/evidence/task-17-metrics.txt`

- [ ] 18. Phase2 운영 runbook 문서화

  **What to do**:
  - 운영자용 start/end API 호출 절차, 장애 대응(큐 손상/overflow), 복구 절차 문서화
  - 원격 접속 클라이언트 표준 경로 명시:
    - 1순위: **Moonlight(원격 PC 클라이언트)** ↔ **Sunshine(Ubuntu 호스트 서버)**
    - 대안: Steam Remote Play(호환성/지연 특성 차이 문서화)
  - 게임패드 입력 경로 명시:
    - 게임패드는 **원격 PC에 연결**하고, 입력이 스트리밍 채널을 통해 호스트 Steam으로 전달됨
    - 패드 미인식 시 점검 순서(클라이언트 입력 설정 → Sunshine 입력 전달 옵션 → Steam Input 설정) 추가
  - 트리거 기준 명시: **원격 스트리밍 세션 시작 즉시 `session-start` 호출** (이미 확정된 정책)
  - 원격 접속 클라이언트 설치/페어링 최소 절차(5~7단계) 추가:
    1. 호스트(Ubuntu)에서 Sunshine 설치 및 서비스 활성화 (`systemctl enable --now sunshine`)
    2. 호스트 방화벽에서 Sunshine 포트 허용(운영 정책에 맞는 최소 포트만)
    3. 원격 PC에 Moonlight 설치
    4. Moonlight에서 호스트 IP 등록 후 페어링 PIN 입력
    5. Moonlight 앱 목록에서 Steam(Big Picture) 엔트리 확인
    6. 원격 접속 시작 시 `session-start` API 자동 호출 훅 검증
    7. 세션 종료 시 `session-end` API 호출 및 큐 replay 시작 확인

  **Acceptance Criteria**:
  - [ ] runbook에 정상/장애 흐름 및 명령 예시 포함
  - [ ] runbook에 원격 접속 클라이언트/게임패드 입력 경로와 점검 절차 포함
  - [ ] runbook만으로 Sunshine↔Moonlight 페어링 및 Steam 실행 재현 가능

  **QA Scenarios**:
  - Scenario: runbook 명령 재현
    - Tool: Bash
    - Steps: 문서 명령만 따라 E2E 재현
    - Expected: session lifecycle + queue replay 성공
    - Evidence: `.sisyphus/evidence/task-18-runbook-e2e.txt`
  - Scenario: 장애 복구 문서 검증
    - Tool: Bash
    - Steps: 큐 파일 손상 복구 절차 수행
    - Expected: 서비스 재기동 후 정상
    - Evidence: `.sisyphus/evidence/task-18-runbook-recovery.txt`
  - Scenario: 원격 게임패드 입력 경로 검증
    - Tool: Bash + 원격 클라이언트(Moonlight)
    - Steps: 원격 PC에 게임패드 연결 → 스트리밍 접속 → Steam Big Picture 내 입력 테스트 화면 진입
    - Expected: 버튼/스틱 입력이 호스트 Steam에서 즉시 인식
    - Evidence: `.sisyphus/evidence/task-18-gamepad-input-path.txt`
  - Scenario: Sunshine↔Moonlight 설치/페어링 절차 검증
    - Tool: Bash + 원격 클라이언트(Moonlight)
    - Steps: runbook 절차만 따라 호스트 등록/페어링/PIN 인증 후 Steam 앱 실행
    - Expected: 원격 PC에서 Steam 라이브러리 화면 표시 + 세션 시작 트리거 로그 확인
    - Evidence: `.sisyphus/evidence/task-18-pairing-flow.txt`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — oracle
- [ ] F2. **Code Quality Review** — unspecified-high
- [ ] F3. **Real Manual QA** — unspecified-high
- [ ] F4. **Scope Fidelity Check** — deep

---

## Commit Strategy

- Commit 1: `feat(types): add steam session and queue contracts`
- Commit 2: `feat(backend): add adaptive steam session APIs and status`
- Commit 3: `feat(gateway): add persistent queue and 202 job flow`
- Commit 4: `feat(gateway): add replay worker and health-gated resume`
- Commit 5: `chore(ops): add tests and phase2 runbook`

---

## Success Criteria

### Verification Commands
```bash
npm run build -w app
npm run build -w services/llm-gateway
# (if tests added)
npm test -w app
npm test -w services/llm-gateway
```

### Final Checklist
- [ ] ADAPTIVE 모드 가드가 모든 Steam API에 적용됨
- [ ] session start/end idempotent 처리
- [ ] queue persistence + replay FIFO + failure isolation 검증
- [ ] non-adaptive 영향 없음
