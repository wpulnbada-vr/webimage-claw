# WebClaw

> Self-hosted image archiver with a web dashboard and OpenClaw integration.

Organize and archive publicly available images from websites you own or have permission to access. Manage downloaded files through a web dashboard or remotely via OpenClaw bot commands.

```
In Discord:
  You: "@MartinClaw archive images from https://example.com/gallery"
  Bot: "Done! Archived 1,523 images in 45 minutes 12 seconds."

  You: "@MartinClaw show my files"
  Bot: "gallery/ (1,523 files), portrait/ (892 files), ..."
```

---

## Disclaimer

This tool is intended for **personal archival** and **educational purposes only**. Users are solely responsible for ensuring their usage complies with:

- The **terms of service** of any website they access
- Applicable **copyright and intellectual property** laws
- **robots.txt** directives and site access policies

The developers assume no liability for misuse of this software. Do not use this tool to download copyrighted content without explicit permission from the content owner.

---

## How It Works

```
Discord / Telegram User
  -> OpenClaw Bot
    -> webclaw CLI
      -> WebClaw Server (running on your PC)
        -> Chrome browses the website
        -> Archives publicly available images
      <- Progress / result report
    <- "Done! 1,523 images archived"
```

- **OpenClaw**: AI assistant for Discord, WhatsApp, Telegram, etc. ([openclaw.ai](https://openclaw.ai))
- **WebClaw**: Image archiver with web dashboard (this project)
- **webclaw CLI**: Command-line bridge between OpenClaw and WebClaw

---

## Features

### Image Archiving
- **Batch Processing** — Enter a URL and keyword to collect matching images
- **Smart Navigation** — Follows pagination, galleries, and sub-pages
- **Lazy-load Aware** — Scrolls to trigger lazy content, parses `data-src` and `srcset`
- **CDP Capture** — Chrome DevTools Protocol captures original-quality images
- **Duplicate Filtering** — Skips thumbnails, icons, and duplicates by size/pattern
- **Job Queue** — 2 concurrent jobs with automatic queuing

### Web Drive
- **Grid / List View** — Toggle between image thumbnail grid and detailed file list
- **Search & Sort** — Find files by name, sort by name/size/date
- **Share Links** — Generate temporary share URLs (token-based, 24h expiry)
- **Copy & Move** — Copy or move files/folders between directories
- **Context Menu** — Right-click for quick actions
- **Drag & Drop Upload** — Drop files directly into the browser
- **Image Preview** — Click to view full-size images with zoom

### Monitoring & Management
- **System Monitoring** — Real-time CPU, memory, disk, browser status
- **Job Statistics** — Success rate, site/keyword charts, 30-day activity graph
- **Discord Alerts** — Webhook notifications for completion, failure, and disk warnings
- **ZIP Export** — Download selected files as .zip archive
- **History Management** — Persistent history with bulk clear

### Security & Remote Access
- **Admin Authentication** — Password-protected dashboard (bcrypt + JWT)
- **API Keys** — `wih_` prefixed keys for external service access
- **Path Traversal Protection** — All file operations validated against downloads directory
- **Remote Dashboard** — Access via VPN to manage files from anywhere

### OpenClaw Integration
- **webclaw CLI** — Zero-dependency CLI for Docker sandbox compatibility
- **Auto Server Discovery** — localhost > host.docker.internal > Docker gateway > bridge IPs
- **API Key Auth** — `WEBCLAW_API_KEY` env var or `~/.webclaw-key` file
- **Auto Provisioning** — `setup-openclaw.js` installs CLI, configures OpenClaw, generates API key

---

## Requirements

| Requirement | Minimum Version | How to Check |
|-------------|-----------------|--------------|
| **Node.js** | v18+ | `node --version` |
| **npm** | v9+ | `npm --version` |
| **Google Chrome** or **Chromium** | Latest | Auto-detected if installed |
| **OpenClaw** (optional) | Latest | `openclaw --version` |

### Supported Operating Systems

| OS | Server | Desktop App | OpenClaw Integration |
|----|--------|-------------|----------------------|
| **Windows 10/11** | Yes | Yes | Yes |
| **macOS 12+** | Yes | Yes | Yes |
| **Ubuntu/Debian** | Yes | Yes | Yes |
| **Other Linux** | Yes | Yes | Yes |

---

## Installation

### Step 1: Download

```bash
git clone https://github.com/wpulnbada-vr/webclaw.git
cd webclaw
npm install

# Build the frontend
cd frontend && npm install && npm run build && cd ..
```

### Step 2: Start the Server

```bash
npm start
```

Open `http://localhost:3100` in your browser. On first access, set an admin password.

**Verify the server is running:**
```bash
curl http://localhost:3100/api/health
# Response: {"status":"ok","version":"0.2.0",...}
```

### Step 3: Use the Dashboard

| Tab | Description |
|-----|-------------|
| **Jobs** | Enter URLs, start archiving, view real-time progress and history |
| **Monitoring** | System metrics, job statistics, Discord alerts, API key management |
| **Files** | Browse downloads, upload/delete files, download as ZIP (requires login) |

---

## OpenClaw Integration

### Prerequisites

1. **OpenClaw installed and configured**
   ```bash
   curl -fsSL https://openclaw.ai/install.sh | bash
   openclaw onboard
   ```

2. **WebClaw server running**
   ```bash
   npm start
   ```

### Automatic Setup

```bash
npm run setup:openclaw
```

This command:
- Installs `webclaw` CLI to `~/.local/bin/`
- Configures OpenClaw's `openclaw.json` with `pathPrepend`
- Updates workspace `TOOLS.md` and `SOUL.md`
- Generates an API key and saves to `~/.webclaw-key`

**Docker sandbox mode:**
```bash
npm run setup:openclaw:sandbox
```

### Manual Setup

**1. Install the webclaw CLI:**
```bash
mkdir -p ~/.local/bin
cp src/cli/webclaw.js ~/.local/bin/webclaw.js
cat > ~/.local/bin/webclaw << 'EOF'
#!/bin/bash
exec node "$(dirname "$0")/webclaw.js" "$@"
EOF
chmod +x ~/.local/bin/webclaw ~/.local/bin/webclaw.js
```

**2. Edit OpenClaw config** (`~/.openclaw/openclaw.json`):
```json
{
  "tools": {
    "exec": {
      "pathPrepend": ["~/.local/bin"]
    }
  }
}
```

**3. Generate an API key** from Dashboard > Monitoring > API Keys, then save it:
```bash
echo "wih_your_key_here" > ~/.webclaw-key
chmod 600 ~/.webclaw-key
```

**4. Restart OpenClaw gateway:**
```bash
openclaw gateway --force
```

### Testing

```bash
webclaw list                    # Direct CLI test
webclaw files /                 # List files (requires API key)
```

---

## Running as a Linux Service

```bash
sudo cp webclaw.service /etc/systemd/system/
sudo nano /etc/systemd/system/webclaw.service  # Edit User and paths
sudo systemctl daemon-reload
sudo systemctl enable webclaw
sudo systemctl start webclaw
```

---

## Docker Environment

If OpenClaw runs inside a Docker sandbox, allow containers to reach port 3100:

```bash
# UFW
sudo ufw allow from 172.16.0.0/12 to any port 3100 proto tcp comment 'WebClaw Docker access'
```

### Server Discovery Order

1. `WEBCLAW_SERVER` environment variable
2. `http://localhost:3100`
3. `http://host.docker.internal:3100` (Docker Desktop)
4. Docker default gateway IP (auto-parsed from `/proc/net/route`)
5. `http://172.17.0.1:3100` (Docker bridge)

---

## Command Reference

### Server

```bash
npm start                      # Start server (port 3100)
PORT=3200 npm start            # Start on a different port
npm run electron               # Start as Electron desktop app
```

### webclaw CLI

```bash
webclaw start <URL> [keyword]  # Start archiving
webclaw status [jobId]         # Check job status
webclaw list                   # List recent jobs
webclaw files [path]           # List downloaded files (requires API key)
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/health` | | Server health check |
| POST | `/api/scrape` | | Start archiving (`{url, keyword}`) |
| GET | `/api/jobs` | | List active jobs |
| GET | `/api/jobs/:id/summary` | | Job summary (plain text) |
| GET | `/api/progress/:id` | | Progress SSE stream |
| GET | `/api/history` | | Full history |
| DELETE | `/api/history` | | Clear all history |
| POST | `/api/abort/:id` | | Abort a job |
| GET | `/api/auth/status` | | Auth status |
| POST | `/api/auth/setup` | | Initial password setup |
| POST | `/api/auth/login` | | Login (returns JWT) |
| GET | `/api/auth/api-keys` | Yes | List API keys |
| POST | `/api/auth/api-keys` | Yes | Generate API key |
| GET | `/api/filemanager?path=` | Yes | List directory |
| POST | `/api/filemanager/upload` | Yes | Upload files |
| POST | `/api/filemanager/mkdir` | Yes | Create folder |
| POST | `/api/filemanager/copy` | Yes | Copy file/folder |
| POST | `/api/filemanager/move` | Yes | Move file/folder |
| POST | `/api/filemanager/share` | Yes | Generate share link |
| GET | `/api/filemanager/shared/:token` | | Access shared file |
| DELETE | `/api/filemanager?path=` | Yes | Delete file/folder |
| POST | `/api/filemanager/download-zip` | Yes | Download as ZIP |
| GET | `/api/monitor/system` | | System metrics |
| GET | `/api/monitor/stats` | | Job statistics |

### Build

```bash
npm run build:frontend          # Build frontend
npm run build:win               # Windows installer
npm run build:linux             # Linux package
```

---

## Troubleshooting

### "Cannot find WebClaw server"
- Check if the server is running: `curl http://localhost:3100/api/health`
- Start it if not: `cd webclaw && npm start`
- In Docker: check firewall rules (see Docker section above)

### "Chrome not found"
- Install Google Chrome or Chromium
- Specify manually: `CHROME_PATH=/usr/bin/google-chrome npm start`
- The Electron desktop app downloads Chrome automatically

### OpenClaw bot not responding
- Check gateway status: `openclaw status`
- Verify the `exec` tool is enabled
- If `groupPolicy` is `"allowlist"`, add your guild ID to the config

---

## Project Structure

```
webclaw/
├── src/
│   ├── core/                 # Core engine
│   │   ├── scraper.js        # Image archiver (Puppeteer + CDP)
│   │   ├── job-manager.js    # Job queue management
│   │   ├── auth.js           # Authentication (bcrypt + JWT + API keys)
│   │   ├── filemanager.js    # File management API
│   │   ├── monitor.js        # System monitoring + Discord alerts
│   │   ├── chrome-finder.js  # Cross-platform Chrome detection
│   │   └── constants.js      # Constants
│   ├── server/               # Express API server
│   │   ├── index.js          # Server entry point
│   │   └── routes/           # API routes
│   ├── desktop/              # Electron desktop app
│   │   ├── main.js           # Main process
│   │   ├── preload.js        # IPC bridge
│   │   └── chrome-manager.js # Chrome download manager
│   └── cli/
│       └── webclaw.js        # OpenClaw CLI tool (zero dependencies)
├── frontend/                 # React 19 + Vite 6 + Tailwind CSS v4
├── public/                   # Frontend build output
├── scripts/
│   └── setup-openclaw.js     # OpenClaw integration + API key setup
├── openclaw/
│   └── webclaw.js            # CLI copy for OpenClaw workspace
├── downloads/                # Downloaded images (git-ignored)
├── webclaw.service           # systemd service file
├── electron-builder.yml      # Electron build config
└── package.json
```

---

## License

MIT License
