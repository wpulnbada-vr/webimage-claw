# WebImageClaw

**OpenClaw에서 웹사이트 이미지를 다운로드하는 기능이 없어 불편해서 만들었습니다.**

OpenClaw Discord 봇(@MartinClaw)에게 "이 사이트에서 이미지 받아줘"라고 말하면, 자동으로 웹사이트를 탐색하고 이미지를 다운로드합니다. 데스크톱 앱에서 직접 사용하거나, Discord 채팅으로 원격 제어할 수 있습니다.

```
Discord에서:
  나: "@MartinClaw https://example.com/gallery 에서 풍경 이미지 받아줘"
  봇: "풍경 이미지 다운로드 완료! 1,523개, 45분 12초 걸렸어요."
```

---

## 어떻게 동작하나요?

```
Discord 사용자
  → OpenClaw 봇 (MartinClaw)
    → exec webclaw start <URL> <키워드>
      → WebImageClaw 서버 (PC에서 실행)
        → Chrome으로 웹사이트 탐색
        → 이미지 자동 다운로드
      ← 진행률/결과 보고
    ← "완료! 1,523개 이미지 다운로드"
```

- **OpenClaw**: Discord/WhatsApp/Telegram 등에서 동작하는 AI 비서 ([openclaw.ai](https://openclaw.ai))
- **WebImageClaw**: 웹사이트 이미지 스크래퍼 (이 프로젝트)
- **webclaw CLI**: OpenClaw와 WebImageClaw를 연결하는 명령줄 도구

---

## 설치 환경

### 필수 조건

| 항목 | 최소 버전 | 확인 방법 |
|------|-----------|-----------|
| **Node.js** | v18 이상 | `node --version` |
| **npm** | v9 이상 | `npm --version` |
| **Google Chrome** 또는 **Chromium** | 최신 | 설치되어 있으면 자동 감지 |
| **OpenClaw** (선택) | 최신 | `openclaw --version` |

### 지원 운영체제

| OS | 서버 | 데스크톱 앱 | OpenClaw 연동 |
|----|-------|-------------|---------------|
| **Windows 10/11** | O | O | O |
| **macOS 12+** | O | O | O |
| **Ubuntu/Debian** | O | O | O |
| **기타 Linux** | O | O | O |

### 사용 포트

| 포트 | 용도 | 변경 방법 |
|------|------|-----------|
| **3100** | WebImageClaw 서버 (기본) | `PORT=3200 npm start` |
| **18789** | OpenClaw 게이트웨이 (기본) | OpenClaw 설정에서 변경 |

---

## 설치 가이드

### 1단계: WebImageClaw 다운로드

```bash
# 프로젝트 클론
git clone https://github.com/your-username/webimage-claw.git
cd webimage-claw

# 의존성 설치
npm install

# 프론트엔드 빌드
cd frontend && npm install && npm run build && cd ..
```

### 2단계: 서버 실행

```bash
# 서버 시작 (기본 포트 3100)
npm start
```

서버가 시작되면 브라우저에서 `http://localhost:3100`으로 접속하여 웹 UI를 사용할 수 있습니다.

**서버 실행 확인:**
```bash
curl http://localhost:3100/api/health
# 응답: {"status":"ok","version":"1.0.0",...}
```

### 3단계: 웹 UI에서 사용하기

1. 브라우저에서 `http://localhost:3100` 열기
2. URL 입력란에 이미지를 다운로드할 웹사이트 주소 입력
3. (선택) 키워드 입력 — 특정 항목만 필터링
4. "스크래핑 시작" 클릭
5. 진행률 실시간 확인
6. 완료 후 다운로드 폴더에서 이미지 확인

다운로드된 이미지는 `downloads/` 폴더에 저장됩니다.

---

## OpenClaw 연동 가이드

OpenClaw와 연동하면 Discord에서 채팅으로 이미지 다운로드를 요청할 수 있습니다.

### 전제 조건

1. **OpenClaw이 설치되어 있어야 합니다**
   ```bash
   # OpenClaw 설치 (아직 안 했다면)
   curl -fsSL https://openclaw.ai/install.sh | bash

   # 설치 확인
   openclaw --version
   ```

2. **OpenClaw 초기 설정이 완료되어 있어야 합니다**
   ```bash
   openclaw onboard
   ```
   - 모델 선택 (Gemini, Ollama 등)
   - Discord 봇 토큰 설정
   - 게이트웨이 시작 확인

3. **WebImageClaw 서버가 실행 중이어야 합니다**
   ```bash
   npm start
   ```

### 연동 설정 (자동)

```bash
# WebImageClaw 디렉토리에서 실행
npm run setup:openclaw
```

이 명령어가 자동으로 수행하는 작업:
- `webclaw` CLI를 `~/.local/bin/`에 설치 (Windows: `%LOCALAPPDATA%\WebImageClaw\bin\`)
- OpenClaw의 `openclaw.json`에 `pathPrepend` 설정 추가
- OpenClaw workspace에 `TOOLS.md`, `SOUL.md` 업데이트

**Docker 샌드박스 모드를 사용하는 경우:**
```bash
npm run setup:openclaw:sandbox
```

### 연동 설정 (수동)

자동 설정이 실패하면 아래 단계를 따라 수동으로 설정할 수 있습니다.

**1. webclaw CLI 설치:**
```bash
# Linux/macOS
mkdir -p ~/.local/bin
cp src/cli/webclaw.js ~/.local/bin/webclaw.js

# 실행 스크립트 생성
cat > ~/.local/bin/webclaw << 'EOF'
#!/bin/bash
exec node "$(dirname "$0")/webclaw.js" "$@"
EOF
chmod +x ~/.local/bin/webclaw ~/.local/bin/webclaw.js

# 동작 확인
webclaw
```

```powershell
# Windows (PowerShell)
$dir = "$env:LOCALAPPDATA\WebImageClaw\bin"
New-Item -ItemType Directory -Force -Path $dir
Copy-Item src\cli\webclaw.js "$dir\webclaw.js"
Set-Content "$dir\webclaw.cmd" '@echo off\r\nnode "%~dp0webclaw.js" %*'

# PATH에 추가 (시스템 환경 변수)
[System.Environment]::SetEnvironmentVariable("Path", $env:Path + ";$dir", "User")
```

**2. OpenClaw 설정 파일 수정:**

`~/.openclaw/openclaw.json`을 열어 다음 항목을 추가합니다:

```json
{
  "tools": {
    "exec": {
      "pathPrepend": ["~/.local/bin"]
    }
  }
}
```

> Windows의 경우 `pathPrepend` 경로를 `%LOCALAPPDATA%\\WebImageClaw\\bin`으로 변경하세요.

**3. OpenClaw workspace 파일 업데이트:**

`~/.openclaw/workspace/TOOLS.md`에 다음을 추가:
```markdown
## webclaw
- 스크랩 시작: `webclaw start <URL> <키워드>`
- 상태 확인: `webclaw status [작업ID]`
- 최근 목록: `webclaw list`
```

`~/.openclaw/workspace/SOUL.md`에 다음을 추가:
```markdown
- **이미지 다운로드 요청** → `exec webclaw start <URL> <키워드>` 사용
```

**4. OpenClaw 게이트웨이 재시작:**
```bash
# 게이트웨이 재시작
openclaw gateway --force
```

### 연동 테스트

```bash
# CLI 직접 테스트
webclaw list

# OpenClaw 에이전트를 통한 테스트
openclaw agent --agent main --message "webclaw list 실행해줘"

# Discord에서 테스트
# → @MartinClaw webclaw list 실행해줘
```

---

## Linux에서 서비스로 등록하기

서버를 백그라운드에서 자동 실행하려면 systemd 서비스로 등록합니다.

```bash
# 서비스 파일 복사 (사용자 이름에 맞게 수정 필요)
sudo cp webimage-claw.service /etc/systemd/system/

# 서비스 파일 편집 — User, WorkingDirectory, ExecStart 경로 확인
sudo nano /etc/systemd/system/webimage-claw.service

# 서비스 등록 및 시작
sudo systemctl daemon-reload
sudo systemctl enable webimage-claw
sudo systemctl start webimage-claw

# 상태 확인
sudo systemctl status webimage-claw
```

**서비스 파일 (`webimage-claw.service`) 수정 포인트:**
```ini
[Service]
User=내사용자이름
WorkingDirectory=/home/내사용자이름/webimage-claw
ExecStart=/usr/bin/env node src/server/index.js
Environment=PORT=3100
Environment=HOST=0.0.0.0
```

> `ExecStart`의 node 경로는 `which node`로 확인할 수 있습니다.
> fnm/nvm을 사용하는 경우 전체 경로를 지정해야 합니다.
> 예: `ExecStart=/home/내사용자이름/.local/share/fnm/aliases/default/bin/node src/server/index.js`

---

## Docker 환경에서 사용하기

OpenClaw이 Docker 샌드박스 안에서 실행되는 경우, 컨테이너에서 호스트의 WebImageClaw 서버에 접근해야 합니다.

### 방화벽 설정 (Linux)

Docker 컨테이너가 호스트의 포트 3100에 접근하려면 방화벽 규칙이 필요합니다:

```bash
# UFW 사용 시
sudo ufw allow from 172.16.0.0/12 to any port 3100 proto tcp comment 'WebImageClaw Docker access'

# iptables 직접 사용 시
sudo iptables -I INPUT 1 -s 172.16.0.0/12 -p tcp --dport 3100 -j ACCEPT
```

### 서버 자동 탐지

webclaw CLI는 서버 주소를 자동으로 탐지합니다:

1. `WEBCLAW_SERVER` 환경변수 (명시적 지정)
2. `http://localhost:3100` (호스트에서 직접 실행)
3. `http://host.docker.internal:3100` (Docker Desktop — macOS/Windows)
4. Docker 기본 게이트웨이 IP (Linux — `/proc/net/route` 자동 파싱)
5. `http://172.17.0.1:3100` (공통 Docker bridge IP)

수동 지정이 필요한 경우:
```bash
WEBCLAW_SERVER=http://192.168.1.100:3100 webclaw list
```

---

## 명령어 모음

### 서버

```bash
npm start                      # 서버 시작 (포트 3100)
PORT=3200 npm start            # 다른 포트로 시작
npm run electron               # Electron 데스크톱 앱으로 시작
```

### webclaw CLI

```bash
webclaw start <URL> [키워드]    # 스크래핑 시작
webclaw status [작업ID]         # 작업 상태 확인
webclaw list                    # 최근 작업 목록
```

### API 엔드포인트

| Method | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | 서버 상태 |
| POST | `/api/scrape` | 스크래핑 시작 (`{url, keyword}`) |
| GET | `/api/jobs` | 활성 작업 목록 |
| GET | `/api/jobs/:id` | 작업 상세 |
| GET | `/api/jobs/:id/summary` | 작업 요약 (텍스트) |
| GET | `/api/progress/:id` | 진행률 SSE 스트림 |
| GET | `/api/history` | 전체 히스토리 |
| POST | `/api/abort/:id` | 작업 중지 |
| DELETE | `/api/jobs/:id` | 작업 삭제 |
| GET | `/api/files/:folder` | 다운로드 파일 목록 |
| GET | `/api/zip/:folder` | ZIP 다운로드 |

### 빌드

```bash
npm run build:frontend          # 프론트엔드 빌드
npm run build:win               # Windows 인스톨러
npm run build:linux             # Linux 패키지
```

---

## 트러블슈팅

### "webclaw 서버를 찾을 수 없습니다"
- WebImageClaw 서버가 실행 중인지 확인: `curl http://localhost:3100/api/health`
- 서버가 꺼져 있다면: `cd webimage-claw && npm start`
- Docker에서 실행 중이라면: 방화벽 설정 확인 (위 Docker 섹션 참고)

### "Chrome을 찾을 수 없습니다"
- Google Chrome 또는 Chromium 설치 필요
- 수동 지정: `CHROME_PATH=/usr/bin/google-chrome npm start`
- Electron 데스크톱 앱은 Chrome을 자동 다운로드합니다

### OpenClaw 봇이 응답하지 않음
- 게이트웨이 실행 확인: `openclaw status`
- Discord 채널 상태 확인: `openclaw status --deep`
- `groupPolicy`가 `"allowlist"`인 경우 길드 ID를 추가해야 합니다
- exec 도구가 활성화되어 있는지 확인

### 다운로드 속도가 느림
- 기본 동시 다운로드: 3개
- 사이트의 Cloudflare 보호 감지 시 자동으로 30초 대기합니다
- 네트워크 환경에 따라 속도가 달라질 수 있습니다

---

## 프로젝트 구조

```
webimage-claw/
├── src/
│   ├── core/                 # 핵심 엔진
│   │   ├── scraper.js        # 이미지 스크래퍼 (Puppeteer)
│   │   ├── job-manager.js    # 작업 큐 관리
│   │   ├── chrome-finder.js  # Chrome 자동 감지
│   │   └── constants.js      # 상수 정의
│   ├── server/               # Express API 서버
│   │   ├── index.js          # 서버 시작점
│   │   └── routes/           # API 라우트
│   ├── desktop/              # Electron 데스크톱 앱
│   │   ├── main.js           # 메인 프로세스
│   │   ├── preload.js        # IPC 브릿지
│   │   └── chrome-manager.js # Chrome 다운로드 관리
│   └── cli/
│       └── webclaw.js        # OpenClaw CLI 도구
├── frontend/                 # React + Vite + Tailwind v4
├── public/                   # 프론트엔드 빌드 결과물
├── scripts/
│   └── setup-openclaw.js     # OpenClaw 연동 자동 설정
├── openclaw/
│   └── webclaw.js            # OpenClaw workspace용 CLI 복사본
├── downloads/                # 다운로드된 이미지 (git 제외)
├── webimage-claw.service     # systemd 서비스 파일
├── electron-builder.yml      # Electron 빌드 설정
└── package.json
```

---

## 라이선스

MIT License

---

*WebImageClaw v1.0.0 — OpenClaw에서 웹사이트 이미지 다운로드가 안 되서 만든 프로젝트입니다.*
