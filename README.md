# WebImageClaw

**OpenClaw lacked a built-in way to download images from websites, which was frustrating — so I built this.**

Tell your OpenClaw Discord bot "download images from this site" and it will automatically browse the website and save images to your PC. You can also use it directly via the desktop app or web UI.

```
In Discord:
  You: "@MartinClaw download landscape images from https://example.com/gallery"
  Bot: "Done! Downloaded 1,523 images in 45 minutes 12 seconds."
```

---

## How It Works

```
Discord User
  -> OpenClaw Bot (MartinClaw)
    -> exec webclaw start <URL> <keyword>
      -> WebImageClaw Server (running on your PC)
        -> Chrome browses the website
        -> Automatically downloads images
      <- Progress / result report
    <- "Done! 1,523 images downloaded"
```

- **OpenClaw**: AI assistant for Discord, WhatsApp, Telegram, etc. ([openclaw.ai](https://openclaw.ai))
- **WebImageClaw**: Website image scraper (this project)
- **webclaw CLI**: Command-line tool that bridges OpenClaw and WebImageClaw

---

## Requirements

### Prerequisites

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

### Ports Used

| Port | Purpose | How to Change |
|------|---------|---------------|
| **3100** | WebImageClaw server (default) | `PORT=3200 npm start` |
| **18789** | OpenClaw gateway (default) | Change in OpenClaw settings |

---

## Installation Guide

### Step 1: Download WebImageClaw

```bash
# Clone the project
git clone https://github.com/wpulnbada-vr/webimage-claw.git
cd webimage-claw

# Install dependencies
npm install

# Build the frontend
cd frontend && npm install && npm run build && cd ..
```

### Step 2: Start the Server

```bash
# Start server (default port 3100)
npm start
```

Once the server is running, open `http://localhost:3100` in your browser to access the web UI.

**Verify the server is running:**
```bash
curl http://localhost:3100/api/health
# Response: {"status":"ok","version":"1.0.0",...}
```

### Step 3: Use the Web UI

1. Open `http://localhost:3100` in your browser
2. Enter the website URL you want to scrape images from
3. (Optional) Enter a keyword to filter specific items
4. Click "Start Scraping"
5. Watch real-time progress
6. Find downloaded images in the `downloads/` folder

---

## OpenClaw Integration Guide

Integrating with OpenClaw lets you request image downloads via Discord chat.

### Prerequisites

1. **OpenClaw must be installed**
   ```bash
   # Install OpenClaw (if not already installed)
   curl -fsSL https://openclaw.ai/install.sh | bash

   # Verify installation
   openclaw --version
   ```

2. **OpenClaw initial setup must be complete**
   ```bash
   openclaw onboard
   ```
   - Select a model (Gemini, Ollama, etc.)
   - Configure Discord bot token
   - Confirm gateway is running

3. **WebImageClaw server must be running**
   ```bash
   npm start
   ```

### Automatic Setup

```bash
# Run from the webimage-claw directory
npm run setup:openclaw
```

This command automatically:
- Installs the `webclaw` CLI to `~/.local/bin/` (Windows: `%LOCALAPPDATA%\WebImageClaw\bin\`)
- Adds `pathPrepend` config to OpenClaw's `openclaw.json`
- Updates OpenClaw workspace `TOOLS.md` and `SOUL.md`

**If using Docker sandbox mode:**
```bash
npm run setup:openclaw:sandbox
```

### Manual Setup

If the automatic setup fails, follow these steps manually.

**1. Install the webclaw CLI:**
```bash
# Linux/macOS
mkdir -p ~/.local/bin
cp src/cli/webclaw.js ~/.local/bin/webclaw.js

# Create a shell wrapper
cat > ~/.local/bin/webclaw << 'EOF'
#!/bin/bash
exec node "$(dirname "$0")/webclaw.js" "$@"
EOF
chmod +x ~/.local/bin/webclaw ~/.local/bin/webclaw.js

# Verify
webclaw
```

```powershell
# Windows (PowerShell)
$dir = "$env:LOCALAPPDATA\WebImageClaw\bin"
New-Item -ItemType Directory -Force -Path $dir
Copy-Item src\cli\webclaw.js "$dir\webclaw.js"
Set-Content "$dir\webclaw.cmd" '@echo off\r\nnode "%~dp0webclaw.js" %*'

# Add to PATH
[System.Environment]::SetEnvironmentVariable("Path", $env:Path + ";$dir", "User")
```

**2. Edit OpenClaw config:**

Open `~/.openclaw/openclaw.json` and add:

```json
{
  "tools": {
    "exec": {
      "pathPrepend": ["~/.local/bin"]
    }
  }
}
```

> On Windows, change the `pathPrepend` path to `%LOCALAPPDATA%\\WebImageClaw\\bin`.

**3. Update OpenClaw workspace files:**

Add to `~/.openclaw/workspace/TOOLS.md`:
```markdown
## webclaw
- Start scraping: `webclaw start <URL> <keyword>`
- Check status: `webclaw status [jobId]`
- Recent jobs: `webclaw list`
```

Add to `~/.openclaw/workspace/SOUL.md`:
```markdown
- **Image download requests** -> use `exec webclaw start <URL> <keyword>`
```

**4. Restart the OpenClaw gateway:**
```bash
openclaw gateway --force
```

### Testing the Integration

```bash
# Direct CLI test
webclaw list

# Test via OpenClaw agent
openclaw agent --agent main --message "run webclaw list"

# Test via Discord
# -> @MartinClaw run webclaw list
```

---

## Running as a Linux Service

To run the server in the background with auto-start on boot:

```bash
# Copy the service file (edit paths to match your username)
sudo cp webimage-claw.service /etc/systemd/system/

# Edit the service file — verify User, WorkingDirectory, ExecStart
sudo nano /etc/systemd/system/webimage-claw.service

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable webimage-claw
sudo systemctl start webimage-claw

# Check status
sudo systemctl status webimage-claw
```

**Key fields to edit in `webimage-claw.service`:**
```ini
[Service]
User=yourusername
WorkingDirectory=/home/yourusername/webimage-claw
ExecStart=/usr/bin/env node src/server/index.js
Environment=PORT=3100
Environment=HOST=0.0.0.0
```

> Find your node path with `which node`.
> If using fnm/nvm, use the full path, e.g.:
> `ExecStart=/home/yourusername/.local/share/fnm/aliases/default/bin/node src/server/index.js`

---

## Docker Environment

If OpenClaw runs inside a Docker sandbox, the container needs access to the host's WebImageClaw server.

### Firewall Setup (Linux)

Allow Docker containers to reach port 3100 on the host:

```bash
# Using UFW
sudo ufw allow from 172.16.0.0/12 to any port 3100 proto tcp comment 'WebImageClaw Docker access'

# Using iptables directly
sudo iptables -I INPUT 1 -s 172.16.0.0/12 -p tcp --dport 3100 -j ACCEPT
```

### Automatic Server Discovery

The webclaw CLI automatically discovers the server in this order:

1. `WEBCLAW_SERVER` environment variable (explicit override)
2. `http://localhost:3100` (running on host directly)
3. `http://host.docker.internal:3100` (Docker Desktop on macOS/Windows)
4. Docker default gateway IP (Linux — auto-parsed from `/proc/net/route`)
5. `http://172.17.0.1:3100` (common Docker bridge IP)

To specify manually:
```bash
WEBCLAW_SERVER=http://192.168.1.100:3100 webclaw list
```

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
webclaw start <URL> [keyword]  # Start scraping
webclaw status [jobId]         # Check job status
webclaw list                   # List recent jobs
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health check |
| POST | `/api/scrape` | Start scraping (`{url, keyword}`) |
| GET | `/api/jobs` | List active jobs |
| GET | `/api/jobs/:id` | Job details |
| GET | `/api/jobs/:id/summary` | Job summary (plain text) |
| GET | `/api/progress/:id` | Progress SSE stream |
| GET | `/api/history` | Full history |
| POST | `/api/abort/:id` | Abort a job |
| DELETE | `/api/jobs/:id` | Delete a job |
| GET | `/api/files/:folder` | List downloaded files |
| GET | `/api/zip/:folder` | Download as ZIP |

### Build

```bash
npm run build:frontend          # Build frontend
npm run build:win               # Windows installer
npm run build:linux             # Linux package
```

---

## Troubleshooting

### "Cannot find WebImageClaw server"
- Check if the server is running: `curl http://localhost:3100/api/health`
- Start it if not: `cd webimage-claw && npm start`
- In Docker: check firewall rules (see Docker section above)

### "Chrome not found"
- Install Google Chrome or Chromium
- Specify manually: `CHROME_PATH=/usr/bin/google-chrome npm start`
- The Electron desktop app downloads Chrome automatically

### OpenClaw bot not responding
- Check gateway status: `openclaw status`
- Check Discord channel: `openclaw status --deep`
- If `groupPolicy` is `"allowlist"`, add your guild ID to the config
- Verify the `exec` tool is enabled

### Slow download speed
- Default concurrent downloads: 3
- Cloudflare protection triggers an automatic 30-second wait
- Speed depends on your network and the target site

---

## Project Structure

```
webimage-claw/
├── src/
│   ├── core/                 # Core engine
│   │   ├── scraper.js        # Image scraper (Puppeteer)
│   │   ├── job-manager.js    # Job queue management
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
│       └── webclaw.js        # OpenClaw CLI tool
├── frontend/                 # React + Vite + Tailwind v4
├── public/                   # Frontend build output
├── scripts/
│   └── setup-openclaw.js     # OpenClaw integration setup
├── openclaw/
│   └── webclaw.js            # CLI copy for OpenClaw workspace
├── downloads/                # Downloaded images (git-ignored)
├── webimage-claw.service     # systemd service file
├── electron-builder.yml      # Electron build config
└── package.json
```

---

## License

MIT License

---

*WebImageClaw v1.0.0 — Built because OpenClaw couldn't download images from websites, and that was annoying.*
