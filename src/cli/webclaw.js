#!/usr/bin/env node
// WebImageClaw CLI — OpenClaw exec 도구
// Node.js built-in http만 사용 (외부 의존성 없음)
//
// 서버 탐지 순서:
//   1. WEBCLAW_SERVER 환경변수 (명시적 지정)
//   2. http://localhost:3100 (호스트에서 직접 실행)
//   3. http://host.docker.internal:3100 (Docker sandbox — macOS/Windows)
//   4. http://172.17.0.1:3100 (Docker sandbox — Linux docker0 bridge)

const http = require('http');
const os = require('os');

const DEFAULT_PORT = 3100;
const POLL_INTERVAL = 10000;
const MAX_POLL_TIME = 300000; // 5분

// --- Server Discovery ---

function probe(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const u = new URL('/api/health', url);
    const req = http.get({
      hostname: u.hostname, port: u.port, path: u.pathname,
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data.status === 'ok' ? url : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function getDockerGateway() {
  // Inside a Docker container, the default gateway points to the host.
  // Parse /proc/net/route for the default gateway (no shell needed).
  try {
    const fs = require('fs');
    const data = fs.readFileSync('/proc/net/route', 'utf-8');
    const lines = data.trim().split('\n').slice(1);
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts[1] === '00000000') {
        // Gateway is in hex, little-endian
        const hex = parts[2];
        const ip = [
          parseInt(hex.substring(6, 8), 16),
          parseInt(hex.substring(4, 6), 16),
          parseInt(hex.substring(2, 4), 16),
          parseInt(hex.substring(0, 2), 16),
        ].join('.');
        return ip;
      }
    }
  } catch {}
  return null;
}

async function discoverServer() {
  // 1. Explicit env var
  if (process.env.WEBCLAW_SERVER) {
    const url = process.env.WEBCLAW_SERVER.replace(/\/+$/, '');
    const ok = await probe(url);
    if (ok) return url;
    return null;
  }

  // 2. Try localhost first (host execution or sandbox=off)
  const localhost = `http://localhost:${DEFAULT_PORT}`;
  const local = await probe(localhost, 2000);
  if (local) return local;

  // 3. Try host.docker.internal (Docker Desktop on macOS/Windows)
  const dockerDesktop = `http://host.docker.internal:${DEFAULT_PORT}`;
  const dd = await probe(dockerDesktop, 2000);
  if (dd) return dd;

  // 4. Auto-detect Docker gateway (works on any Docker network)
  const gw = getDockerGateway();
  if (gw) {
    const gwUrl = `http://${gw}:${DEFAULT_PORT}`;
    const gwOk = await probe(gwUrl, 2000);
    if (gwOk) return gwOk;
  }

  // 5. Common Docker bridge IPs
  for (const ip of ['172.17.0.1', '172.18.0.1', '172.19.0.1']) {
    if (ip === gw) continue;
    const url = `http://${ip}:${DEFAULT_PORT}`;
    const ok = await probe(url, 1500);
    if (ok) return ok;
  }

  // 6. Try 127.0.0.1
  const loopback = `http://127.0.0.1:${DEFAULT_PORT}`;
  const lb = await probe(loopback, 2000);
  if (lb) return lb;

  return null;
}

// --- HTTP Request Helper ---

let SERVER = null;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {},
      timeout: 15000,
    };

    if (body) {
      const data = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        const ct = res.headers['content-type'] || '';
        if (ct.includes('json')) {
          try { resolve(JSON.parse(chunks)); } catch { resolve(chunks); }
        } else {
          resolve(chunks);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function log(msg) {
  process.stdout.write(`[webclaw] ${msg}\n`);
}

// --- Ensure server is reachable ---

async function ensureServer() {
  SERVER = await discoverServer();
  if (!SERVER) {
    log('오류: WebImageClaw 서버를 찾을 수 없습니다.');
    log('');
    log('확인사항:');
    log('  1. WebImageClaw 앱 또는 서버가 실행 중인지 확인');
    log(`  2. 기본 포트: ${DEFAULT_PORT}`);
    log('  3. 수동 지정: WEBCLAW_SERVER=http://IP:PORT webclaw ...');
    process.exit(1);
  }
}

// --- Commands ---

async function cmdStart(url, keyword) {
  if (!url) {
    log('사용법: webclaw start <URL> [키워드]');
    process.exit(1);
  }

  await ensureServer();

  let data;
  try {
    data = await request('POST', '/api/scrape', { url, keyword: keyword || '' });
  } catch (err) {
    log(`오류: 작업 생성 실패 - ${err.message}`);
    process.exit(1);
  }

  if (data.error === 'duplicate') {
    log(`이미 진행 중: ${data.existingJobId}`);
    data = { jobId: data.existingJobId };
  }

  if (!data.jobId) {
    log(`오류: ${data.error || '알 수 없는 오류'}`);
    process.exit(1);
  }

  const jobId = data.jobId;
  let host;
  try { host = new URL(url).hostname; } catch { host = url; }
  log(`시작: ${keyword || 'direct'} (${host})`);

  // 폴링
  const startTime = Date.now();
  let lastMsg = '';

  while (Date.now() - startTime < MAX_POLL_TIME) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    let summary;
    try {
      summary = await request('GET', `/api/jobs/${jobId}/summary`);
    } catch { continue; }

    if (typeof summary !== 'string') summary = String(summary);

    const statusLine = summary.match(/상태: (.+)/);
    const status = statusLine ? statusLine[1].trim() : '';

    const progressLine = summary.match(/진행: (.+)/);
    const resultLine = summary.match(/결과: (.+)/);
    const searchLine = summary.match(/검색: (.+)/);

    let msg = '';
    if (searchLine) msg = `검색 완료: ${searchLine[1]}`;
    else if (progressLine) msg = `다운로드 중: ${progressLine[1]}`;
    else if (resultLine) msg = `완료! ${keyword || 'direct'}: ${resultLine[1]}`;
    else msg = status;

    if (msg && msg !== lastMsg) {
      log(msg);
      lastMsg = msg;
    }

    if (status === '완료' || status === '실패' || status === '중단') {
      if (resultLine && lastMsg !== `완료! ${keyword || 'direct'}: ${resultLine[1]}`) {
        log(`완료! ${keyword || 'direct'}: ${resultLine[1]}`);
      }
      if (status === '실패') {
        const errorLine = summary.match(/오류: (.+)/);
        if (errorLine) log(`오류: ${errorLine[1]}`);
      }
      break;
    }
  }

  if (Date.now() - startTime >= MAX_POLL_TIME) {
    log(`타임아웃 (5분). 작업 ID: ${jobId}`);
    log(`상태 확인: webclaw status ${jobId}`);
  }
}

async function cmdStatus(jobId) {
  await ensureServer();

  if (jobId) {
    try {
      const summary = await request('GET', `/api/jobs/${jobId}/summary`);
      process.stdout.write(typeof summary === 'string' ? summary : JSON.stringify(summary));
    } catch {
      log('작업을 찾을 수 없습니다.');
    }
  } else {
    const jobs = await request('GET', '/api/jobs');
    const active = (Array.isArray(jobs) ? jobs : []).filter(j => j.status === 'running' || j.status === 'queued');
    if (active.length === 0) {
      log('실행 중인 작업 없음');
    } else {
      for (const j of active) {
        log(`[${j.id}] ${j.keyword || 'direct'} — ${j.status}`);
      }
    }
  }
}

async function cmdList() {
  await ensureServer();

  const history = await request('GET', '/api/history');
  const items = (Array.isArray(history) ? history : []).slice(0, 10);

  if (items.length === 0) {
    log('작업 기록 없음');
    return;
  }

  for (const h of items) {
    const status = { completed: 'O', failed: 'X', running: '>', queued: '.', aborted: '-' }[h.status] || '?';
    const total = h.result?.total ? ` (${h.result.total}장)` : '';
    let host;
    try { host = new URL(h.url).hostname; } catch { host = h.url; }
    log(`[${status}] ${h.keyword || 'direct'}${total} — ${host}`);
  }
}

// --- Main ---
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'start':
    cmdStart(args[0], args.slice(1).join(' ')).catch(err => {
      log(`오류: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'status':
    cmdStatus(args[0]).catch(err => {
      log(`오류: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'list':
    cmdList().catch(err => {
      log(`오류: ${err.message}`);
      process.exit(1);
    });
    break;
  default:
    log('WebImageClaw CLI');
    log('');
    log('사용법:');
    log('  webclaw start <URL> [키워드]  — 스크래핑 시작');
    log('  webclaw status [작업ID]       — 상태 확인');
    log('  webclaw list                  — 최근 작업 목록');
    log('');
    log('서버 설정:');
    log(`  기본 포트: ${DEFAULT_PORT}`);
    log('  수동 지정: WEBCLAW_SERVER=http://IP:PORT');
    log('  자동 탐지: localhost → host.docker.internal → 172.17.0.1');
    break;
}
