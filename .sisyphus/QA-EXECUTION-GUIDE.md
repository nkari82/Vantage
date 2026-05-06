# Steam Adaptive Queue/Replay QA Execution Guide

## Test Environment Setup

### Prerequisites
1. Build completed: ✓ (app + llm-gateway)
2. Test runner created: ✓ (.sisyphus/qa-test-runner.mjs)
3. Evidence directory created: ✓ (.sisyphus/evidence/)

### Required Services

The QA test suite requires two services to be running:

#### 1. Backend Server (Port 18080)
```powershell
# Terminal 1
cd D:\Work\Vantage
$env:VANTAGE_SYSTEM_TOKEN = "test-token-12345"
npm run dev:server -w app
```

#### 2. LLM Gateway (Port 8080)
```powershell
# Terminal 2
cd D:\Work\Vantage
$env:VANTAGE_SYSTEM_TOKEN = "test-token-12345"
$env:VANTAGE_BACKEND_URL = "http://127.0.0.1:18080"
$env:VANTAGE_UPSTREAM_URL = "http://127.0.0.1:8000"
$env:VANTAGE_AUTO_START_VLLM = "false"
npm run dev -w services/llm-gateway
```

**Note**: We set `VANTAGE_AUTO_START_VLLM=false` because we don't have vLLM running for this test. The test focuses on queue/replay orchestration behavior.

### Running the Test Suite

Once both services are running:

```powershell
# Terminal 3
cd D:\Work\Vantage\.sisyphus
$env:VANTAGE_SYSTEM_TOKEN = "test-token-12345"
node qa-test-runner.mjs
```

## Test Matrix

### P0 Tests (Critical Path)
- **P0-1**: ADAPTIVE mode enforcement (non-ADAPTIVE → 409)
- **P0-2**: Session start orchestration (active flag set)
- **P0-3**: Active session queueing (/v1 → 202+jobId)
- **P0-4**: Session end + replay request trigger
- **P0-6**: FIFO replay order verification

### P1 Tests (Important)
- **P1-1**: Idempotent session start (duplicate start returns idempotent=true)
- **P1-2**: Session end without active (409 + SESSION_NOT_ACTIVE)
- **P1-3**: Enqueue without active session (409 + SESSION_NOT_ACTIVE)
- **P1-4**: Job status transitions (queued → processing → completed)
- **P1-5**: Idempotency key deduplication (same key+body → same jobId)
- **P1-6**: Queue overflow behavior (documented)

## Expected Outcomes

### Passing Criteria
- All P0 tests must PASS
- At least 80% of P1 tests must PASS
- Evidence files generated for all tests
- Final report shows clear PASS/FAIL status

### Evidence Files Generated
All evidence stored in `.sisyphus/evidence/`:
- `p0-1-adaptive-enforcement.json` - ADAPTIVE guard test
- `p0-2-session-start.json` - Session start state changes
- `p0-3-active-queueing.json` - Queue behavior during session
- `p0-4-session-end-replay.json` - Replay trigger verification
- `p0-6-fifo-order.json` - Queue claim order
- `p1-1-idempotent-start.json` - Idempotency test
- `p1-2-end-without-active.json` - Error handling test
- `p1-3-enqueue-without-active.json` - Error handling test
- `p1-4-job-status-transitions.json` - State machine test
- `p1-5-idempotency-dedup.json` - Deduplication test
- `p1-6-queue-overflow.json` - Overflow documentation
- `qa-test-report.json` - **Final comprehensive report**

## Known Limitations

1. **No vLLM instance**: Tests verify queue orchestration without actual LLM processing
2. **Replay execution**: Tests verify replay request trigger but not actual HTTP replay to vLLM
3. **Power mode changes**: Tests assume power control scripts exist but don't verify actual hardware changes
4. **Queue overflow**: Requires 50+ enqueue operations; documented but not executed

## Troubleshooting

### Services not starting
- Check port conflicts (18080, 8080)
- Verify Node.js version (18+)
- Check build output for errors

### Tests failing
- Verify services are healthy: `curl http://localhost:18080/health`
- Check evidence files for detailed request/response data
- Review service logs for errors

### Timeout issues
- Increase sleep durations in test runner
- Check network latency
- Verify service response times
