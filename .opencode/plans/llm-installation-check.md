# LLM 자동 설치 여부 확인 계획

## Goal
이 프로젝트가 LLM(vLLM 등) 및 모델 가중치를 자동으로 설치하는지 확인하고, 사용자에게 명확한 답변을 제공합니다.

## Target Files
- `scripts/`
- `README.md`
- `services/`

## Root Cause
사용자가 프로젝트의 LLM 설치 자동화 여부를 궁금해함. 현재 메모리상으로는 서비스 제어(start/stop)만 확인됨.

## Implementation Steps
1. 프로젝트 루트 및 `scripts/` 디렉토리 파일 목록 확인.
2. `README.md` 및 관련 문서에서 설치 관련 내용 검색.
3. `services/` 디렉토리 구조 확인.
4. 확인된 내용을 바탕으로 사용자에게 답변.

## Risks
- 설치 스크립트가 존재하지 않을 경우 수동 설치가 필요함을 안내해야 함.

## Validation Checklist
- [ ] 설치 자동화 스크립트 존재 여부 확인
- [ ] 문서상 설치 가이드 존재 여부 확인
- [ ] 사용자에게 명확한 답변 제공
