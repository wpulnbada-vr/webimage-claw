#!/usr/bin/env node
/**
 * WebImageClaw — OpenClaw Integration Setup Script
 *
 * Run this after installing OpenClaw to integrate WebImageClaw.
 * Cross-platform support (Windows, macOS, Linux).
 *
 * Steps:
 *   1. Install webclaw CLI to user PATH
 *   2. Add pathPrepend/sandbox config to OpenClaw openclaw.json
 *   3. Update workspace TOOLS.md and SOUL.md
 *
 * Usage:
 *   node scripts/setup-openclaw.js [--sandbox]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// --- Detect paths ---

const HOME = os.homedir();
const PLATFORM = process.platform;
const IS_WINDOWS = PLATFORM === 'win32';
const IS_MAC = PLATFORM === 'darwin';

// WebImageClaw project root
const PROJECT_ROOT = path.join(__dirname, '..');

// webclaw CLI source
const WEBCLAW_SRC = path.join(PROJECT_ROOT, 'src', 'cli', 'webclaw.js');

// User bin directory for CLI tools
const USER_BIN = IS_WINDOWS
  ? path.join(HOME, 'AppData', 'Local', 'WebImageClaw', 'bin')
  : path.join(HOME, '.local', 'bin');

// OpenClaw config paths
const OPENCLAW_DIR = path.join(HOME, '.openclaw');
const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, 'openclaw.json');
const OPENCLAW_WORKSPACE = path.join(OPENCLAW_DIR, 'workspace');

const SANDBOX_MODE = process.argv.includes('--sandbox');
const WEBCLAW_KEY_FILE = path.join(HOME, '.webclaw-key');

function log(msg) { console.log(`[setup] ${msg}`); }
function warn(msg) { console.log(`[setup] ⚠ ${msg}`); }

// --- 1. Install webclaw CLI ---

function installCLI() {
  log('Installing webclaw CLI...');

  if (!fs.existsSync(USER_BIN)) {
    fs.mkdirSync(USER_BIN, { recursive: true });
  }

  const dest = path.join(USER_BIN, 'webclaw.js');
  fs.copyFileSync(WEBCLAW_SRC, dest);

  if (IS_WINDOWS) {
    // Create .cmd wrapper for Windows
    const cmdPath = path.join(USER_BIN, 'webclaw.cmd');
    fs.writeFileSync(cmdPath, `@echo off\r\nnode "%~dp0webclaw.js" %*\r\n`);
    log(`Installed: ${cmdPath}`);
  } else {
    // Create shell wrapper for Unix
    const binPath = path.join(USER_BIN, 'webclaw');
    fs.writeFileSync(binPath, `#!/bin/bash\nexec node "${dest}" "$@"\n`);
    fs.chmodSync(binPath, '755');
    log(`Installed: ${binPath}`);
  }

  // Check PATH
  const pathDirs = (process.env.PATH || '').split(IS_WINDOWS ? ';' : ':');
  if (!pathDirs.some(d => path.resolve(d) === path.resolve(USER_BIN))) {
    warn(`${USER_BIN} is not in your PATH.`);
    if (IS_WINDOWS) {
      log(`Run in PowerShell: [Environment]::SetEnvironmentVariable("PATH", "$env:PATH;${USER_BIN}", "User")`);
    } else {
      log(`Add to your shell config: export PATH="${USER_BIN}:$PATH"`);
      log(`Example: echo 'export PATH="${USER_BIN}:$PATH"' >> ~/.bashrc`);
    }
  }
}

// --- 2. Configure OpenClaw ---

function configureOpenClaw() {
  log('Checking OpenClaw configuration...');

  if (!fs.existsSync(OPENCLAW_DIR)) {
    warn('OpenClaw installation not found (~/.openclaw/).');
    warn('Please install OpenClaw first: https://openclaw.ai');
    return false;
  }

  let config = {};
  if (fs.existsSync(OPENCLAW_CONFIG)) {
    try {
      const raw = fs.readFileSync(OPENCLAW_CONFIG, 'utf-8');
      // Strip JSON5 comments, then sanitize control chars in strings
      let cleaned = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      // Remove unescaped control characters (common in auto-generated configs)
      cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
      config = JSON.parse(cleaned);
    } catch (err) {
      warn(`Failed to parse openclaw.json: ${err.message}`);
      warn('Manual configuration required.');
      printManualConfig();
      return false;
    }
  }

  let modified = false;

  // Ensure tools.exec.pathPrepend includes our bin dir
  if (!config.tools) config.tools = {};
  if (!config.tools.exec) config.tools.exec = {};
  if (!config.tools.exec.pathPrepend) config.tools.exec.pathPrepend = [];

  const normalizedBin = USER_BIN.replace(HOME, '~');
  if (!config.tools.exec.pathPrepend.includes(normalizedBin) &&
      !config.tools.exec.pathPrepend.includes(USER_BIN)) {
    config.tools.exec.pathPrepend.push(normalizedBin);
    modified = true;
    log(`Added ${normalizedBin} to pathPrepend`);
  }

  // Sandbox mode configuration
  if (SANDBOX_MODE) {
    log('Configuring Docker sandbox mode...');

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.sandbox) config.agents.defaults.sandbox = {};
    if (!config.agents.defaults.sandbox.docker) config.agents.defaults.sandbox.docker = {};

    const docker = config.agents.defaults.sandbox.docker;

    // Add setup command to install webclaw inside sandbox
    const setupCmd = 'mkdir -p /usr/local/lib/webclaw && cp /workspace/webclaw.js /usr/local/lib/webclaw/ && printf "#!/bin/bash\\nexec node /usr/local/lib/webclaw/webclaw.js \\"\\$@\\"\\n" > /usr/local/bin/webclaw && chmod +x /usr/local/bin/webclaw';

    if (!docker.setupCommand) {
      docker.setupCommand = setupCmd;
      modified = true;
    } else if (!docker.setupCommand.includes('webclaw')) {
      docker.setupCommand += ' && ' + setupCmd;
      modified = true;
    }

    // Bind mount webclaw.js into sandbox workspace
    if (!docker.binds) docker.binds = [];
    const bindEntry = `${path.join(USER_BIN, 'webclaw.js')}:/workspace/webclaw.js:ro`;
    if (!docker.binds.some(b => b.includes('webclaw.js'))) {
      docker.binds.push(bindEntry);
      modified = true;
    }

    log('Docker sandbox configuration complete');
  }

  if (modified) {
    // Backup existing config
    if (fs.existsSync(OPENCLAW_CONFIG)) {
      const backup = OPENCLAW_CONFIG + '.backup.' + Date.now();
      fs.copyFileSync(OPENCLAW_CONFIG, backup);
      log(`Backed up existing config: ${backup}`);
    }

    fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2));
    log('openclaw.json updated');
  } else {
    log('openclaw.json already configured, no changes needed');
  }

  return true;
}

// --- 3. Update workspace files ---

function updateWorkspace() {
  log('Updating workspace files...');

  if (!fs.existsSync(OPENCLAW_WORKSPACE)) {
    warn(`Workspace directory not found: ${OPENCLAW_WORKSPACE}`);
    warn('Run OpenClaw setup first: openclaw setup');
    return;
  }

  // TOOLS.md
  const toolsPath = path.join(OPENCLAW_WORKSPACE, 'TOOLS.md');
  if (fs.existsSync(toolsPath)) {
    let tools = fs.readFileSync(toolsPath, 'utf-8');
    if (!tools.includes('webclaw')) {
      tools += `
### webclaw
- WebImageClaw image scraper (connects to host PC server)
- Start scraping: \`webclaw start <URL> <keyword>\`
- Check status: \`webclaw status [jobId]\`
- List recent jobs: \`webclaw list\`
- List downloaded files: \`webclaw files [path]\` (requires API key)
`;
      fs.writeFileSync(toolsPath, tools);
      log('TOOLS.md updated');
    } else {
      log('TOOLS.md already contains webclaw, skipped');
    }
  } else {
    warn('TOOLS.md not found, skipped');
  }

  // SOUL.md
  const soulPath = path.join(OPENCLAW_WORKSPACE, 'SOUL.md');
  if (fs.existsSync(soulPath)) {
    let soul = fs.readFileSync(soulPath, 'utf-8');
    if (!soul.includes('webclaw')) {
      // Find a good insertion point (supports both English and Korean section headers)
      const insertMarker = soul.includes('Tool Usage') ? 'Tool Usage' :
                           soul.includes('도구 사용') ? '도구 사용' : null;
      const webcrawRule = `\n- **Bulk image download** → use exec tool: \`webclaw start <URL> <keyword>\`\n  - Example: "download landscape images from https://example.com" → \`webclaw start https://example.com landscape\`\n`;

      if (insertMarker) {
        // Insert after the section that mentions tools
        const lines = soul.split('\n');
        const idx = lines.findIndex(l => l.includes(insertMarker));
        if (idx !== -1) {
          // Find the end of the tool rules block
          let insertIdx = lines.length;
          for (let i = idx + 1; i < lines.length; i++) {
            if (lines[i].startsWith('## ') || lines[i].startsWith('# ')) {
              insertIdx = i;
              break;
            }
          }
          lines.splice(insertIdx, 0, webcrawRule);
          soul = lines.join('\n');
        } else {
          soul += webcrawRule;
        }
      } else {
        soul += webcrawRule;
      }

      fs.writeFileSync(soulPath, soul);
      log('SOUL.md updated');
    } else {
      log('SOUL.md already contains webclaw, skipped');
    }
  } else {
    warn('SOUL.md not found, skipped');
  }
}

// --- Manual config fallback ---

function printManualConfig() {
  log('');
  log('=== Manual Configuration ===');
  log('');
  log('Add the following to openclaw.json:');
  log('');
  log('{');
  log('  "tools": {');
  log('    "exec": {');
  log(`      "pathPrepend": ["${USER_BIN.replace(HOME, '~')}"]`);
  log('    }');
  log('  }');
  log('}');
  log('');
  if (SANDBOX_MODE) {
    log('Additional sandbox mode config:');
    log('{');
    log('  "agents": { "defaults": { "sandbox": { "docker": {');
    log(`    "binds": ["${path.join(USER_BIN, 'webclaw.js')}:/workspace/webclaw.js:ro"],`);
    log('    "setupCommand": "cp /workspace/webclaw.js /usr/local/bin/ && chmod +x /usr/local/bin/webclaw.js"');
    log('  }}}}');
    log('}');
  }
}

// --- 4. Provision API Key ---

function provisionApiKey() {
  log('Checking API Key...');

  // If key file already exists, skip
  if (fs.existsSync(WEBCLAW_KEY_FILE)) {
    const existing = fs.readFileSync(WEBCLAW_KEY_FILE, 'utf-8').trim();
    if (existing.startsWith('wih_')) {
      log(`API Key already provisioned: ${existing.slice(0, 12)}...`);
      return;
    }
  }

  // Try to read auth-config.json from the project's data directory
  // Desktop app stores in userData, server stores in project dir
  const possiblePaths = [
    path.join(PROJECT_ROOT, 'auth-config.json'),
    path.join(HOME, '.config', 'webimage-claw', 'auth-config.json'),
    path.join(HOME, '.config', 'WebImageClaw', 'auth-config.json'),
  ];

  let authConfig = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        authConfig = JSON.parse(fs.readFileSync(p, 'utf-8'));
        log(`Found auth config: ${p}`);
        break;
      } catch {}
    }
  }

  if (!authConfig) {
    log('No auth-config.json found. API Key will be provisioned when you first set up admin password.');
    log('After setup, generate an API Key from the Dashboard > API Keys section.');
    log(`Save it to: ${WEBCLAW_KEY_FILE}`);
    return;
  }

  // Generate an API Key programmatically
  try {
    const crypto = require('crypto');
    const keyRaw = crypto.randomBytes(32).toString('hex');
    const apiKey = `wih_${keyRaw}`;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    if (!authConfig.apiKeys) authConfig.apiKeys = [];
    authConfig.apiKeys.push({
      id: crypto.randomUUID(),
      name: 'OpenClaw (auto-provisioned)',
      keyHash,
      createdAt: new Date().toISOString(),
    });

    // Write back auth-config
    const configPath = possiblePaths.find(p => fs.existsSync(p));
    fs.writeFileSync(configPath, JSON.stringify(authConfig, null, 2));

    // Save key to file
    fs.writeFileSync(WEBCLAW_KEY_FILE, apiKey + '\n', { mode: 0o600 });
    log(`API Key generated and saved to ${WEBCLAW_KEY_FILE}`);
    log(`Key: ${apiKey.slice(0, 12)}... (full key in file)`);
  } catch (err) {
    warn(`Failed to provision API Key: ${err.message}`);
    log('Generate an API Key manually from the Dashboard > API Keys section.');
    log(`Then save it to: ${WEBCLAW_KEY_FILE}`);
  }
}

// --- Main ---

log('WebImageClaw — OpenClaw Integration Setup');
log(`Platform: ${PLATFORM}, Home: ${HOME}`);
log(`Mode: ${SANDBOX_MODE ? 'Docker Sandbox' : 'Host (sandbox=off)'}`);
log('');

installCLI();
log('');

const configOk = configureOpenClaw();
log('');

if (configOk) {
  updateWorkspace();
  log('');
  provisionApiKey();
}

log('');
log('=== Setup Complete ===');
log('');
log('Next steps:');
log('  1. Make sure the WebImageClaw server is running');
log('     - Launch the desktop app or run: node src/server/index.js');
log('  2. Restart the OpenClaw gateway');
log('  3. Test in Discord: "download images from https://example.com keyword"');
if (SANDBOX_MODE) {
  log('');
  log('Sandbox mode notes:');
  log('  - Sandbox containers must be recreated (delete existing, auto-created on next run)');
  log('  - WebImageClaw server must listen on 0.0.0.0:3100 on the host');
}
