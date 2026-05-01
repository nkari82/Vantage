# Vantage 프로젝트 설치 및 배포 가이드

본 문서는 우분투 서버 환경에서 Vantage 프로젝트를 설치하고, Docker 및 vLLM 기반의 서비스 환경을 구축하는 방법을 안내합니다.

## 1. 서버 환경 준비 (Ubuntu Server)
서버에 접속한 후 기본 패키지를 업데이트합니다.
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git vim htop net-tools
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

## 5. vLLM (Qwen3.6) 서비스 구축
`docker-compose.yml`을 사용하여 vLLM 컨테이너를 실행합니다.
```bash
# vLLM 컨테이너 실행
docker compose up -d vllm-coder
```

## 6. 서비스 설치 (Systemd)
Vantage 백엔드와 에이전트를 시스템 서비스로 등록합니다.
```bash
# 서비스 파일 심볼릭 링크 및 시작
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vantage-backend.service
sudo systemctl enable --now vantage-ak620-agent.service
sudo systemctl enable --now vantage-llm-gateway.service
```

## 7. 검증
```bash
# 서비스 상태 확인
systemctl status vantage-backend
# 대시보드 접속: http://<서버IP>:18080
```
