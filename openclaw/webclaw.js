#!/usr/bin/env node
// WebClaw CLI — OpenClaw exec tool
// Uses only Node.js built-in http (no external dependencies)
//
// Server discovery order:
//   1. WEBCLAW_SERVER env var (explicit override)
//   2. http://localhost:3100 (host execution)
//   3. http://host.docker.internal:3100 (Docker sandbox — macOS/Windows)
//   4. http://172.17.0.1:3100 (Docker sandbox — Linux docker0 bridge)

const http = require('http');
const os = require('os');
const path = require('path');

const DEFAULT_PORT = 3100;
const POLL_INTERVAL = 10000;
const MAX_POLL_TIME = 300000; // 5 min

// API Key: env var or ~/.webclaw-key file
const API_KEY = process.env.WEBCLAW_API_KEY || (() => {
  try {
    const fs = require('fs');
    const keyFile = path.join(os.homedir(), '.webclaw-key');
    return fs.readFileSync(keyFile, 'utf-8').trim();
  } catch { return ''; }
})();

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

    if (API_KEY) {
      options.headers['X-API-Key'] = API_KEY;
    }

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
    log('Error: Cannot find WebClaw server.');
    log('');
    log('Checklist:');
    log('  1. Make sure the WebClaw app or server is running');
    log(`  2. Default port: ${DEFAULT_PORT}`);
    log('  3. Manual override: WEBCLAW_SERVER=http://IP:PORT webclaw ...');
    process.exit(1);
  }
}

// --- Commands ---

async function cmdStart(url, keyword) {
  if (!url) {
    log('Usage: webclaw start <URL> [keyword]');
    process.exit(1);
  }

  await ensureServer();

  let data;
  try {
    data = await request('POST', '/api/scrape', { url, keyword: keyword || '' });
  } catch (err) {
    log(`Error: Failed to create job - ${err.message}`);
    process.exit(1);
  }

  if (data.error === 'duplicate') {
    log(`Already in progress: ${data.existingJobId}`);
    data = { jobId: data.existingJobId };
  }

  if (!data.jobId) {
    log(`Error: ${data.error || 'unknown error'}`);
    process.exit(1);
  }

  const jobId = data.jobId;
  let host;
  try { host = new URL(url).hostname; } catch { host = url; }
  log(`Started: ${keyword || 'direct'} (${host})`);

  // Poll for progress
  const startTime = Date.now();
  let lastMsg = '';

  while (Date.now() - startTime < MAX_POLL_TIME) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    let summary;
    try {
      summary = await request('GET', `/api/jobs/${jobId}/summary`);
    } catch { continue; }

    if (typeof summary !== 'string') summary = String(summary);

    const statusLine = summary.match(/Status: (.+)/);
    const status = statusLine ? statusLine[1].trim() : '';

    const progressLine = summary.match(/Progress: (.+)/);
    const resultLine = summary.match(/Result: (.+)/);
    const searchLine = summary.match(/Search: (.+)/);

    let msg = '';
    if (searchLine) msg = `Search complete: ${searchLine[1]}`;
    else if (progressLine) msg = `Downloading: ${progressLine[1]}`;
    else if (resultLine) msg = `Done! ${keyword || 'direct'}: ${resultLine[1]}`;
    else msg = status;

    if (msg && msg !== lastMsg) {
      log(msg);
      lastMsg = msg;
    }

    if (status === 'Completed' || status === 'Failed' || status === 'Aborted') {
      if (resultLine && lastMsg !== `Done! ${keyword || 'direct'}: ${resultLine[1]}`) {
        log(`Done! ${keyword || 'direct'}: ${resultLine[1]}`);
      }
      if (status === 'Failed') {
        const errorLine = summary.match(/Error: (.+)/);
        if (errorLine) log(`Error: ${errorLine[1]}`);
      }
      break;
    }
  }

  if (Date.now() - startTime >= MAX_POLL_TIME) {
    log(`Timeout (5 min). Job ID: ${jobId}`);
    log(`Check status: webclaw status ${jobId}`);
  }
}

async function cmdStatus(jobId) {
  await ensureServer();

  if (jobId) {
    try {
      const summary = await request('GET', `/api/jobs/${jobId}/summary`);
      process.stdout.write(typeof summary === 'string' ? summary : JSON.stringify(summary));
    } catch {
      log('Job not found.');
    }
  } else {
    const jobs = await request('GET', '/api/jobs');
    const active = (Array.isArray(jobs) ? jobs : []).filter(j => j.status === 'running' || j.status === 'queued');
    if (active.length === 0) {
      log('No active jobs');
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
    log('No job history');
    return;
  }

  for (const h of items) {
    const status = { completed: 'O', failed: 'X', running: '>', queued: '.', aborted: '-' }[h.status] || '?';
    const total = h.result?.total ? ` (${h.result.total} imgs)` : '';
    let host;
    try { host = new URL(h.url).hostname; } catch { host = h.url; }
    log(`[${status}] ${h.keyword || 'direct'}${total} — ${host}`);
  }
}

async function cmdFiles(dirPath) {
  await ensureServer();

  if (!API_KEY) {
    log('Error: API Key required for file management.');
    log('Set WEBCLAW_API_KEY env var or save key to ~/.webclaw-key');
    process.exit(1);
  }

  const p = dirPath || '/';
  let data;
  try {
    data = await request('GET', `/api/filemanager?path=${encodeURIComponent(p)}`);
  } catch (err) {
    log(`Error: ${err.message}`);
    process.exit(1);
  }

  if (data.error) {
    log(`Error: ${data.error}`);
    process.exit(1);
  }

  log(`Path: ${data.path || p}`);
  const items = data.items || [];
  if (items.length === 0) {
    log('(empty)');
    return;
  }

  for (const item of items) {
    const type = item.type === 'directory' ? '[DIR]' : '     ';
    const size = item.size != null ? formatFileSize(item.size) : '';
    log(`  ${type} ${item.name}${size ? '  ' + size : ''}`);
  }
  log(`Total: ${items.length} items`);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// --- Main ---
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'start':
    cmdStart(args[0], args.slice(1).join(' ')).catch(err => {
      log(`Error: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'status':
    cmdStatus(args[0]).catch(err => {
      log(`Error: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'list':
    cmdList().catch(err => {
      log(`Error: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'files':
    cmdFiles(args[0]).catch(err => {
      log(`Error: ${err.message}`);
      process.exit(1);
    });
    break;
  default:
    log('WebClaw CLI');
    log('');
    log('Usage:');
    log('  webclaw start <URL> [keyword]  — Start scraping');
    log('  webclaw status [jobId]         — Check job status');
    log('  webclaw list                   — List recent jobs');
    log('  webclaw files [path]           — List files (requires API key)');
    log('');
    log('Server:');
    log(`  Default port: ${DEFAULT_PORT}`);
    log('  Manual override: WEBCLAW_SERVER=http://IP:PORT');
    log('  Auto-discovery: localhost → host.docker.internal → 172.17.0.1');
    log('');
    log('Auth:');
    log('  WEBCLAW_API_KEY env var or ~/.webclaw-key file');
    break;
}
