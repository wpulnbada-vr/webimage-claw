# Development Guide

Technical documentation for developers working on WebImageClaw.

**Current Version: 0.2.0**

---

## Changelog

### v0.2.0 (2026-02-17)

**Web Drive (File Manager)**
- Grid/List 뷰 전환 (이미지 미리보기 그리드)
- 파일/폴더 검색 및 정렬 (이름, 크기, 날짜)
- 파일 공유 링크 생성 (임시 토큰 기반)
- 파일/폴더 복사 및 이동 (Copy/Move)
- 우클릭 컨텍스트 메뉴
- 드래그 앤 드롭 업로드 영역
- 이미지 미리보기 모달 (확대/축소)

**OpenClaw 연동 웹 드라이브**
- Discord/Telegram에서 OpenClaw 봇에게 파일 관리 명령 가능
- `webclaw files [path]` — 원격 파일 목록 조회
- `webclaw start <URL> [keyword]` — 이미지 수집 후 웹 드라이브에서 관리
- API Key 인증으로 외부 접근 보안

**Scraper 모듈 리팩토링**
- 모놀리식 `scraper.js` (1,125줄) → 모듈 `scraper/` (15파일, 1,396줄)
- Strategy + Registry 패턴 기반 사이트별 어댑터
- Content Area 필터링 (사이드바 썸네일 제거)
- 4단계 검색 파이프라인: Custom URL → WP `?s=` → Form 감지 → Category

**인증 및 보안**
- Admin 인증 (bcrypt + JWT)
- API Key 관리 (`wih_` 접두사)
- 공유 링크 토큰 생성/검증
- 경로 탐색 보호

**모니터링**
- 시스템 모니터링 (CPU, 메모리, 디스크)
- Discord 웹훅 알림
- 작업 통계 차트

### v0.1.0

- 초기 릴리스: 기본 이미지 스크래핑 및 다운로드

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Entry Points                       │
├──────────┬──────────────┬──────────┬────────────────┤
│ Server   │ Desktop      │ CLI      │ Setup Script   │
│ index.js │ main.js      │webclaw.js│setup-openclaw.js│
├──────────┴──────────────┴──────────┴────────────────┤
│                   Express API                        │
│  /api/scrape  /api/jobs  /api/progress  /api/health  │
│  /api/filemanager (copy, move, share, upload, zip)   │
├─────────────────────────────────────────────────────┤
│                   Core Engine                        │
│  JobManager (queue, lifecycle, events)               │
│  ImageScraper (Puppeteer + CDP + stealth)            │
│  FileManager (browse, copy, move, share, upload)     │
│  ChromeFinder (cross-platform detection)             │
└─────────────────────────────────────────────────────┘
```

**Data flow:** HTTP Request → Express Route → JobManager → ImageScraper → Chrome (Puppeteer) → Downloaded files

---

## Core Modules

### ImageScraper (`src/core/scraper.js`)

Puppeteer-based web scraper with stealth plugin and CDP network interception.

```javascript
class ImageScraper extends EventEmitter {
  async scrape(url, keyword, options = {})
  abort()
}
```

**scrape() options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minWidth` | number | 400 | Minimum image width (px) |
| `minHeight` | number | 400 | Minimum image height (px) |
| `minFileSize` | number | 5000 | Minimum file size (bytes) |
| `concurrency` | number | 3 | Concurrent downloads |
| `maxPages` | number | 50 | Max pagination pages |
| `downloadDir` | string | `./downloads` | Output directory |
| `chromePath` | string | auto-detect | Chrome executable path |

**Returns:** `{ success, total, folder, duration, error? }`

**Events** (all emitted as `'progress'`):

| type | Fields | Description |
|------|--------|-------------|
| `status` | `message` | General status update |
| `cf` | `message` | Cloudflare bypass in progress |
| `search` | `pages, posts` | Search phase completed |
| `post` | `current, total, title` | Processing a post |
| `found` | `count, message` | Images found in current post |
| `download` | `current, total, filename` | Image download progress |
| `complete` | `total, folder, duration` | Scraping finished |
| `error` | `message` | Error occurred |

**Scraping pipeline:**

1. Launch Chrome with stealth plugin
2. Enable CDP for network interception (image caching)
3. Navigate to URL, wait for Cloudflare if detected
4. If keyword provided: search for posts matching keyword across pagination
5. For each post: extract image URLs from `<img>`, `<a>`, background styles
6. Filter by size, extension, and exclude patterns
7. Download concurrently with deduplication
8. Clean up browser on completion or error

### JobManager (`src/core/job-manager.js`)

Job queue with concurrent execution, history persistence, and subscriber pattern.

```javascript
class JobManager extends EventEmitter {
  constructor({ maxConcurrent = 2, historyFile, downloadsDir, chromePath })

  createJob(url, keyword)          // → { jobId, status } | { error: 'duplicate', existingJobId }
  abortJob(jobId)                  // → { status: 'aborted' } | { error }
  deleteJob(jobId)                 // → { status: 'deleted' } | { error }
  getJob(jobId)                    // → Job object (sanitized)
  getJobs()                        // → Job[] (active, reversed)
  getHistory()                     // → Job[] (from persistent file)
  getJobSummary(jobId)             // → plain text string
  subscribeToJob(jobId, callback)  // → unsubscribe function
  recoverOrphanedJobs()            // Re-queues interrupted jobs on startup
}
```

**Job lifecycle:** `queued` → `running` → `completed` | `failed` | `aborted`

**Events:**

| Event | Payload | When |
|-------|---------|------|
| `job:created` | jobId | New job queued |
| `job:progress` | (jobId, event) | Scraper progress update |
| `job:completed` | (jobId, result) | Job finished successfully |
| `job:failed` | (jobId, error) | Job failed |

**Subscriber pattern:** Used by SSE routes instead of coupling to Express response objects.

```javascript
const unsubscribe = jobManager.subscribeToJob(jobId, (event) => {
  // event: { type, ...data }
});
// Call unsubscribe() when client disconnects
```

### ChromeFinder (`src/core/chrome-finder.js`)

```javascript
function findChrome(customCachePath?: string): string | null
```

**Search order:**

1. `CHROME_PATH` environment variable
2. `@puppeteer/browsers` cache directory (newest version first)
3. System installation paths:
   - **Windows:** Program Files, LocalAppData (Chrome + Chromium)
   - **macOS:** `/Applications/Google Chrome.app`, `/Applications/Chromium.app`
   - **Linux:** `/usr/bin/google-chrome-stable`, `/usr/bin/chromium-browser`, `/snap/bin/chromium`

### FileManager (`src/core/filemanager.js`)

File management with copy, move, share link, and upload support.

```javascript
// Key API endpoints
POST /api/filemanager/copy     // { src, dest } — Copy file/folder
POST /api/filemanager/move     // { src, dest } — Move file/folder
POST /api/filemanager/share    // { path } — Generate share token
GET  /api/filemanager/shared/:token  // Access shared file via token
```

**Share Links:** Generates time-limited tokens (24h default) for file access without authentication. Tokens are stored in memory and expire automatically.

### Constants (`src/core/constants.js`)

```javascript
EXCLUDE_PATTERNS  // string[] — URL substrings to skip (icons, avatars, ads, etc.)
BLOCKED_SCRIPTS   // string[] — Script URLs to block (anti-devtools)
IMAGE_EXTENSIONS  // RegExp — /\.(jpg|jpeg|png|webp|gif|bmp)(\?|$)/i
```

---

## Server Layer

### startServer (`src/server/index.js`)

```javascript
async function startServer(options = {}): Promise<{ app, server, port, jobManager }>
```

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `process.env.PORT \|\| 3100` | Server port |
| `host` | `process.env.HOST \|\| '0.0.0.0'` | Bind address |
| `downloadsDir` | `./downloads` | Image storage |
| `historyFile` | `./history.json` | Persistent history |
| `publicDir` | `./public` | Frontend static files |
| `chromePath` | auto-detect | Chrome path override |

**Middleware stack:**
1. CORS (all origins)
2. JSON body parser
3. Static files (`/` → `publicDir`)
4. Downloads browser (`/downloads/` → `serve-index`)
5. API routes (see below)

### API Routes

#### POST `/api/scrape` (`routes/scrape.js`)

Create a new scraping job.

```json
// Request
{ "url": "https://example.com", "keyword": "landscape" }

// Response (success)
{ "jobId": "abc123", "status": "running" }

// Response (duplicate)
{ "error": "duplicate", "existingJobId": "abc123" }
```

#### GET `/api/jobs` (`routes/jobs.js`)

List all active jobs.

```json
[{ "id": "abc123", "url": "...", "keyword": "...", "status": "running", ... }]
```

#### GET `/api/jobs/:id`

Single job detail.

#### GET `/api/jobs/:id/summary`

Plain text summary optimized for CLI/LLM consumption (minimal tokens):

```
Status: Downloading
Keyword: landscape
Progress: 245/1200 images (20%)
Elapsed: 12m 30s
```

#### GET `/api/progress/:jobId` (`routes/progress.js`)

Server-Sent Events stream. Replays past events, then streams new ones in real-time.

```
data: {"type":"download","current":1,"total":100,"filename":"img001.jpg"}

data: {"type":"complete","total":100,"folder":"landscape","duration":"5m 30s"}
```

#### POST `/api/abort/:id`

Abort a running job. Returns `{ status: 'aborted' }`.

#### DELETE `/api/jobs/:id`

Delete a job from memory and history.

#### GET `/browse/:folder` (`routes/browse.js`)

Paginated image gallery for browsing large download folders. Displays 200 images per page with lazy loading, pagination controls, and links to ZIP download and raw file listing.

```
http://localhost:3100/browse/landscape?page=2
```

#### GET `/api/files/:folder` (`routes/files.js`)

List image files in a download folder.

```json
[{ "name": "img001.jpg", "size": 245000, "url": "/downloads/landscape/img001.jpg" }]
```

#### GET `/api/zip/:folder`

Download a folder as a ZIP archive (streamed using `archiver`).

#### GET `/api/health` (`routes/health.js`)

```json
{
  "status": "ok",
  "version": "0.2.0",
  "uptime": 3600,
  "hostname": "my-pc",
  "jobs": { "running": 1, "queued": 0, "completed": 5, "total": 6 }
}
```

---

## CLI Tool (`src/cli/webclaw.js`)

Standalone Node.js script with zero external dependencies (uses only `http` and `fs` built-ins). Designed to run inside OpenClaw's Docker sandbox without `npm install`.

### Commands

```bash
webclaw start <URL> [keyword]  # Create job, poll progress, exit on completion
webclaw status [jobId]         # Show job status or list active jobs
webclaw list                   # Show last 10 jobs from history
```

### Server Discovery

Probes `/api/health` endpoints in this order (2-3 second timeout each):

| Priority | URL | Scenario |
|----------|-----|----------|
| 1 | `$WEBCLAW_SERVER` | Explicit override |
| 2 | `localhost:3100` | Host execution |
| 3 | `host.docker.internal:3100` | Docker Desktop (macOS/Windows) |
| 4 | Docker gateway IP:3100 | Docker on Linux (parsed from `/proc/net/route`) |
| 5 | `172.17-19.0.1:3100` | Common Docker bridge IPs |
| 6 | `127.0.0.1:3100` | Loopback fallback |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `WEBCLAW_SERVER` | Override server URL (e.g., `http://192.168.1.100:3100`) |

---

## Desktop App (`src/desktop/`)

### main.js

Electron main process managing app lifecycle, embedded Express server, and system tray.

**Port selection:** Scans 3100-3199 for an available port.

**IPC channels:**

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `open-downloads` | renderer → main | Open downloads folder in file manager |
| `get-version` | renderer → main | Get app version string |
| `get-downloads-dir` | renderer → main | Get downloads directory path |

**CLI flags:**

| Flag | Description |
|------|-------------|
| `--clear-data` | Delete history.json and Chrome cache on startup |
| `--include-downloads` | Also delete downloaded images (with `--clear-data`) |

### chrome-manager.js

```javascript
async function ensureChrome(cachePath, mainWindow?): Promise<string>
```

Downloads Chrome via `@puppeteer/browsers` if not found locally. Shows progress in the Electron window title bar.

### preload.js

Context-isolated IPC bridge exposing `window.electronAPI`:

```javascript
window.electronAPI = {
  openDownloads: () => ipcRenderer.invoke('open-downloads'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  getDownloadsDir: () => ipcRenderer.invoke('get-downloads-dir')
}
```

---

## Frontend (`frontend/`)

React 19 + Vite 6 + Tailwind CSS v4.

### Components

| Component | File | Purpose |
|-----------|------|---------|
| `App` | `App.jsx` | Main layout, state management, API calls |
| `Header` | `Header.jsx` | App title bar |
| `InputForm` | `InputForm.jsx` | URL + keyword input, start button |
| `JobPanel` | `JobPanel.jsx` | Active job progress display |
| `Sidebar` | `Sidebar.jsx` | Job history list |
| `ImageGrid` | `ImageGrid.jsx` | Downloaded image thumbnails |
| `FileManager` | `FileManager.jsx` | Web drive file management (v0.2) |
| `FileGrid` | `fm/FileGrid.jsx` | Grid view with image thumbnails |
| `FileList` | `fm/FileList.jsx` | List view with sort controls |
| `FileToolbar` | `fm/FileToolbar.jsx` | Search, sort, view toggle |
| `ContextMenu` | `fm/ContextMenu.jsx` | Right-click context menu |
| `ImagePreview` | `fm/ImagePreview.jsx` | Full-size image preview modal |
| `ShareModal` | `fm/ShareModal.jsx` | Share link generation UI |
| `UploadDropZone` | `fm/UploadDropZone.jsx` | Drag & drop file upload |

### Build

```bash
cd frontend
npm install
npm run build    # Output → ../public/
```

Dev server with API proxy:
```bash
npm run dev      # Vite dev server, proxies /api → localhost:3100
```

---

## Setup Script (`scripts/setup-openclaw.js`)

Automates OpenClaw integration for general users.

```bash
node scripts/setup-openclaw.js            # Host mode
node scripts/setup-openclaw.js --sandbox  # Docker sandbox mode
```

**Step 1 — Install CLI:**
- Copies `webclaw.js` + creates shell/cmd wrapper
- Linux/macOS: `~/.local/bin/webclaw`
- Windows: `%LOCALAPPDATA%\WebImageClaw\bin\webclaw.cmd`

**Step 2 — Configure OpenClaw:**
- Reads `~/.openclaw/openclaw.json`
- Adds `tools.exec.pathPrepend` with CLI bin directory
- Sandbox mode: adds Docker `setupCommand` and `binds`
- Creates timestamped backup before writing

**Step 3 — Update Workspace:**
- Appends webclaw section to `~/.openclaw/workspace/TOOLS.md`
- Appends image download rule to `~/.openclaw/workspace/SOUL.md`

---

## OpenClaw Integration Details

### How webclaw executes from OpenClaw

1. User sends Discord message: "download images from example.com"
2. OpenClaw agent reads TOOLS.md/SOUL.md → decides to use `exec` tool
3. Agent calls: `exec webclaw start https://example.com keyword`
4. OpenClaw's exec tool runs the command with `pathPrepend` in PATH
5. webclaw CLI discovers the WebImageClaw server (auto-discovery)
6. CLI creates job via `POST /api/scrape`, polls `GET /api/jobs/:id/summary`
7. CLI outputs progress to stdout → OpenClaw captures output
8. Agent formats result and sends Discord reply

### Key OpenClaw config (`openclaw.json`)

```json
{
  "tools": {
    "exec": {
      "pathPrepend": ["~/.local/bin"]
    }
  }
}
```

### Docker sandbox mode

When OpenClaw runs agents in Docker containers:

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "docker": {
          "setupCommand": "mkdir -p /usr/local/bin && cp /opt/webclaw/webclaw.js /usr/local/bin/ && printf '#!/bin/sh\\nexec node /usr/local/bin/webclaw.js \"$@\"\\n' > /usr/local/bin/webclaw && chmod +x /usr/local/bin/webclaw",
          "binds": ["/path/to/webclaw.js:/opt/webclaw/webclaw.js:ro"]
        }
      }
    }
  }
}
```

---

## Development Setup

```bash
# Clone
git clone https://github.com/wpulnbada-vr/webimage-claw.git
cd webimage-claw

# Install all dependencies
npm install
cd frontend && npm install && cd ..

# Start server in development
npm start

# Build frontend (after changes)
npm run build:frontend

# Test core modules load correctly
node -e "require('./src/core/scraper'); require('./src/core/job-manager'); console.log('OK')"

# Test CLI
node src/cli/webclaw.js list

# Test API
curl http://localhost:3100/api/health
curl -X POST http://localhost:3100/api/scrape -H 'Content-Type: application/json' -d '{"url":"https://example.com","keyword":"test"}'
```

### Building Electron App

```bash
# Windows
npm run build:win

# Linux
npm run build:linux
```

Output goes to `dist/`.

---

## Dependencies

### Runtime

| Package | Purpose |
|---------|---------|
| `express` | HTTP server framework |
| `cors` | Cross-origin resource sharing |
| `puppeteer-core` | Chrome automation (no bundled Chrome) |
| `puppeteer-extra` | Plugin system for Puppeteer |
| `puppeteer-extra-plugin-stealth` | Anti-detection measures |
| `@puppeteer/browsers` | Chrome download/management |
| `archiver` | ZIP file creation |
| `sanitize-filename` | Safe file naming |
| `serve-index` | Directory listing middleware |

### Desktop

| Package | Purpose |
|---------|---------|
| `electron` | Desktop app framework |
| `electron-builder` | App packaging/distribution |

### Frontend

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | UI framework |
| `vite` | Build tool / dev server |
| `@vitejs/plugin-react` | React JSX support |
| `tailwindcss` | Utility-first CSS |
| `@tailwindcss/vite` | Tailwind Vite integration |

### CLI (webclaw.js)

**No external dependencies.** Uses only Node.js built-in `http` and `fs` modules. This is intentional — the CLI must work inside Docker containers without `npm install`.
