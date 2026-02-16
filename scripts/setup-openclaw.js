#!/usr/bin/env node
/**
 * WebImageClaw — OpenClaw 연동 셋업 스크립트
 *
 * 일반 사용자가 OpenClaw 공식 설치 후 WebImageClaw를 연동할 때 실행.
 * 크로스 플랫폼 (Windows, macOS, Linux) 지원.
 *
 * 수행 작업:
 *   1. webclaw CLI를 사용자 경로에 설치
 *   2. OpenClaw openclaw.json에 pathPrepend/sandbox 설정 추가
 *   3. 워크스페이스 TOOLS.md, SOUL.md 업데이트
 *
 * 사용법:
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

function log(msg) { console.log(`[setup] ${msg}`); }
function warn(msg) { console.log(`[setup] ⚠ ${msg}`); }

// --- 1. Install webclaw CLI ---

function installCLI() {
  log('webclaw CLI 설치 중...');

  if (!fs.existsSync(USER_BIN)) {
    fs.mkdirSync(USER_BIN, { recursive: true });
  }

  const dest = path.join(USER_BIN, 'webclaw.js');
  fs.copyFileSync(WEBCLAW_SRC, dest);

  if (IS_WINDOWS) {
    // Create .cmd wrapper for Windows
    const cmdPath = path.join(USER_BIN, 'webclaw.cmd');
    fs.writeFileSync(cmdPath, `@echo off\r\nnode "%~dp0webclaw.js" %*\r\n`);
    log(`설치: ${cmdPath}`);
  } else {
    // Create shell wrapper for Unix
    const binPath = path.join(USER_BIN, 'webclaw');
    fs.writeFileSync(binPath, `#!/bin/bash\nexec node "${dest}" "$@"\n`);
    fs.chmodSync(binPath, '755');
    log(`설치: ${binPath}`);
  }

  // Check PATH
  const pathDirs = (process.env.PATH || '').split(IS_WINDOWS ? ';' : ':');
  if (!pathDirs.some(d => path.resolve(d) === path.resolve(USER_BIN))) {
    warn(`${USER_BIN} 이 PATH에 없습니다.`);
    if (IS_WINDOWS) {
      log(`PowerShell에서 실행: [Environment]::SetEnvironmentVariable("PATH", "$env:PATH;${USER_BIN}", "User")`);
    } else {
      log(`셸 설정에 추가: export PATH="${USER_BIN}:$PATH"`);
      log(`예: echo 'export PATH="${USER_BIN}:$PATH"' >> ~/.bashrc`);
    }
  }
}

// --- 2. Configure OpenClaw ---

function configureOpenClaw() {
  log('OpenClaw 설정 확인 중...');

  if (!fs.existsSync(OPENCLAW_DIR)) {
    warn('OpenClaw 설치를 찾을 수 없습니다 (~/.openclaw/).');
    warn('먼저 OpenClaw를 설치해주세요: https://openclaw.ai');
    return false;
  }

  let config = {};
  if (fs.existsSync(OPENCLAW_CONFIG)) {
    try {
      const raw = fs.readFileSync(OPENCLAW_CONFIG, 'utf-8');
      // Strip JSON5 comments for parsing
      const cleaned = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      config = JSON.parse(cleaned);
    } catch (err) {
      warn(`openclaw.json 파싱 실패: ${err.message}`);
      warn('수동 설정이 필요합니다.');
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
    log(`pathPrepend에 ${normalizedBin} 추가`);
  }

  // Sandbox mode configuration
  if (SANDBOX_MODE) {
    log('Docker sandbox 모드 설정 중...');

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

    log('sandbox Docker 설정 완료');
  }

  if (modified) {
    // Backup existing config
    if (fs.existsSync(OPENCLAW_CONFIG)) {
      const backup = OPENCLAW_CONFIG + '.backup.' + Date.now();
      fs.copyFileSync(OPENCLAW_CONFIG, backup);
      log(`기존 설정 백업: ${backup}`);
    }

    fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2));
    log('openclaw.json 업데이트 완료');
  } else {
    log('openclaw.json 이미 설정됨, 변경 없음');
  }

  return true;
}

// --- 3. Update workspace files ---

function updateWorkspace() {
  log('워크스페이스 파일 업데이트 중...');

  if (!fs.existsSync(OPENCLAW_WORKSPACE)) {
    warn(`워크스페이스 디렉토리 없음: ${OPENCLAW_WORKSPACE}`);
    warn('OpenClaw setup 명령을 먼저 실행하세요: openclaw setup');
    return;
  }

  // TOOLS.md
  const toolsPath = path.join(OPENCLAW_WORKSPACE, 'TOOLS.md');
  if (fs.existsSync(toolsPath)) {
    let tools = fs.readFileSync(toolsPath, 'utf-8');
    if (!tools.includes('webclaw')) {
      tools += `
### webclaw
- WebImageClaw 이미지 스크래퍼 (호스트 PC 서버 연동)
- 스크랩 시작: \`webclaw start <URL> <키워드>\`
- 상태 확인: \`webclaw status [작업ID]\`
- 최근 목록: \`webclaw list\`
`;
      fs.writeFileSync(toolsPath, tools);
      log('TOOLS.md 업데이트 완료');
    } else {
      log('TOOLS.md 이미 webclaw 포함, 스킵');
    }
  } else {
    warn('TOOLS.md 없음, 스킵');
  }

  // SOUL.md
  const soulPath = path.join(OPENCLAW_WORKSPACE, 'SOUL.md');
  if (fs.existsSync(soulPath)) {
    let soul = fs.readFileSync(soulPath, 'utf-8');
    if (!soul.includes('webclaw')) {
      // Find a good insertion point
      const insertMarker = soul.includes('도구 사용') ? '도구 사용' : null;
      const webcrawRule = `\n- **이미지 대량 다운로드** → exec 도구로 \`webclaw start <URL> <키워드>\` 실행\n  - 예: "피아 이미지 받아줘 https://example.com" → \`webclaw start https://example.com 피아\`\n`;

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
      log('SOUL.md 업데이트 완료');
    } else {
      log('SOUL.md 이미 webclaw 포함, 스킵');
    }
  } else {
    warn('SOUL.md 없음, 스킵');
  }
}

// --- Manual config fallback ---

function printManualConfig() {
  log('');
  log('=== 수동 설정 방법 ===');
  log('');
  log('openclaw.json에 다음 설정을 추가하세요:');
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
    log('Sandbox 모드 추가 설정:');
    log('{');
    log('  "agents": { "defaults": { "sandbox": { "docker": {');
    log(`    "binds": ["${path.join(USER_BIN, 'webclaw.js')}:/workspace/webclaw.js:ro"],`);
    log('    "setupCommand": "cp /workspace/webclaw.js /usr/local/bin/ && chmod +x /usr/local/bin/webclaw.js"');
    log('  }}}}');
    log('}');
  }
}

// --- Main ---

log('WebImageClaw — OpenClaw 연동 셋업');
log(`플랫폼: ${PLATFORM}, 홈: ${HOME}`);
log(`모드: ${SANDBOX_MODE ? 'Docker Sandbox' : 'Host (sandbox=off)'}`);
log('');

installCLI();
log('');

const configOk = configureOpenClaw();
log('');

if (configOk) {
  updateWorkspace();
}

log('');
log('=== 셋업 완료 ===');
log('');
log('다음 단계:');
log('  1. WebImageClaw 서버가 실행 중인지 확인');
log('     - 데스크톱 앱 실행 또는: node src/server/index.js');
log('  2. OpenClaw 재시작 (gateway 재시작)');
log('  3. Discord에서 테스트: "이미지 받아줘 https://example.com 키워드"');
if (SANDBOX_MODE) {
  log('');
  log('Sandbox 모드 참고:');
  log('  - sandbox 컨테이너 재생성 필요 (기존 컨테이너 삭제 후 자동 생성)');
  log('  - WebImageClaw 서버는 호스트에서 0.0.0.0:3100 으로 실행해야 함');
}
