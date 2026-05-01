# Vantage 프로젝트 설치 및 배포 가이드

본 문서는 우분투 서버 환경에서 Vantage 프로젝트를 설치하고, Docker 및 vLLM 기반의 서비스 환경을 구축하는 방법을 안내합니다.

## 프로젝트 개요
Vantage는 듀얼 RTX 3090 기반 로컬 AI 서버를 위한 시스템 운용 플랫폼입니다. 시스템 상태 모니터링, GPU 전력 모드 제어, LLM Gateway 자동 관리(vLLM 기동/종료), 그리고 AK620 Digital 디스플레이 연동을 통합 웹 대시보드에서 관리합니다. 듀얼 RTX 3090 서버를 저전력 홈서버와 고성능 LLM 서버 사이에서 자동 전환하며 전력을 최적화합니다.

## 1. 서버 환경 준비 (Ubuntu Server)
서버에 접속한 후 기본 패키지를 업데이트합니다.
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git vim htop net-tools nodejs npm
```

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

## 5. 전체 자동 설치 (권장)
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
```
- 통합 대시보드 및 Backend API: `http://<서버IP>:18080`
- LLM 엔드포인트: `http://<서버IP>:8080`

`install-vantage.sh`는 `apps/dashboard`의 Node 프로젝트를 감지해 의존성 설치와 React/TypeScript 빌드를 자동으로 수행합니다. 빌드 결과물은 `apps/dashboard/dist`에 생성되며, `vantage-backend.service`가 같은 포트(18080)에서 정적 대시보드와 `/api/*`를 함께 제공합니다. 별도 `vantage-dashboard.service`는 더 이상 기본 기동 대상이 아닙니다.

## 9. Admin Token / 보안 운영
전원 모드 변경, vLLM 시작/중지, 로그 조회, 시스템 재부팅/종료 같은 운영 API는 `VANTAGE_ADMIN_TOKEN` Bearer token이 필요합니다. 설치 스크립트가 `/etc/vantage/backend.env`에 token을 자동 생성하고 `vantage-backend.service`가 이 파일을 `EnvironmentFile`로 읽습니다.

```bash
sudo cat /etc/vantage/backend.env
# VANTAGE_ADMIN_TOKEN=<token>
```

대시보드의 **Admin Access** 카드에 token 값을 저장하면 브라우저가 보호된 API 호출에 `Authorization: Bearer <token>` 헤더를 함께 전송합니다. `vantage-llm-gateway.service`도 같은 env 파일을 읽어 자동 vLLM start/touch 호출에 token을 전달합니다. token을 교체한 경우 backend와 gateway를 재시작하세요.

```bash
sudo systemctl restart vantage-backend
sudo systemctl restart vantage-llm-gateway
```

## 10. 전력 표시 참고
대시보드의 **Estimated System Power**는 GPU 실측 전력(`nvidia-smi`) + CPU package 전력(RAPL `/sys/class/powercap`) + 기본 시스템 전력 추정치(`VANTAGE_BASE_SYSTEM_POWER_W`, 기본 55W)를 합산한 값입니다. CPU RAPL을 제공하지 않는 시스템에서는 GPU 전력과 기본 추정치만으로 표시됩니다.

