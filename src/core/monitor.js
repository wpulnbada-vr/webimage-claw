const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let CONFIG_FILE;
let DOWNLOADS_DIR;

function init(configDir, downloadsDir) {
  CONFIG_FILE = path.join(configDir, 'monitor-config.json');
  DOWNLOADS_DIR = downloadsDir;
}

let diskCache = { data: null, timestamp: 0 };
const DISK_CACHE_TTL = 30000;

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return { discord: { webhookUrl: '', enabled: false, notifyOnComplete: true, notifyOnFail: true, notifyOnDiskWarning: true, diskWarningThresholdMB: 50000 } };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getCpuPercent() {
  const now = Date.now();
  const elapsed = (now - lastCpuTime) * 1000;
  const usage = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = now;
  if (elapsed === 0) return 0;
  return Math.round(((usage.user + usage.system) / elapsed) * 1000) / 10;
}

function getDiskUsage() {
  const now = Date.now();
  if (diskCache.data && (now - diskCache.timestamp) < DISK_CACHE_TTL) return diskCache.data;

  let totalSize = 0, totalFiles = 0, totalFolders = 0;
  try {
    if (fs.existsSync(DOWNLOADS_DIR)) {
      const entries = fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          totalFolders++;
          const folderPath = path.join(DOWNLOADS_DIR, entry.name);
          try {
            const files = fs.readdirSync(folderPath);
            totalFiles += files.length;
            for (const file of files) {
              try { totalSize += fs.statSync(path.join(folderPath, file)).size; } catch {}
            }
          } catch {}
        }
      }
    }
  } catch {}

  let diskFreeMB = 0, diskTotalMB = 0;
  try {
    if (process.platform !== 'win32') {
      const df = execFileSync('df', ['-BM', '--output=avail,size', DOWNLOADS_DIR], { encoding: 'utf-8' });
      const lines = df.trim().split('\n');
      const parts = lines[lines.length - 1].trim().split(/\s+/);
      if (parts.length >= 2) { diskFreeMB = parseInt(parts[0]) || 0; diskTotalMB = parseInt(parts[1]) || 0; }
    }
  } catch {}

  const data = { downloadsSizeMB: Math.round(totalSize / (1024 * 1024)), downloadsFiles: totalFiles, downloadsFolders: totalFolders, diskFreeMB, diskTotalMB };
  diskCache = { data, timestamp: now };
  return data;
}

function collectSystemMetrics(jobManager, serverStartTime) {
  const mem = process.memoryUsage();
  const disk = getDiskUsage();
  const allJobs = jobManager.getJobs();
  const running = allJobs.filter(j => j.status === 'running').length;
  const queued = allJobs.filter(j => j.status === 'queued').length;

  return {
    uptime: Math.floor((Date.now() - new Date(serverStartTime).getTime()) / 1000),
    serverStart: serverStartTime,
    cpu: { percent: getCpuPercent() },
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMB: Math.round(mem.heapTotal / (1024 * 1024)),
      rssMB: Math.round(mem.rss / (1024 * 1024)),
      systemFreeMB: Math.round(os.freemem() / (1024 * 1024)),
      systemTotalMB: Math.round(os.totalmem() / (1024 * 1024)),
    },
    disk,
    puppeteer: { activeBrowsers: running, maxConcurrent: 2 },
    queue: { running, queued },
  };
}

function aggregateStats(history) {
  const total = history.length;
  const completed = history.filter(h => h.status === 'completed');
  const failed = history.filter(h => h.status === 'failed');
  const totalImages = completed.reduce((sum, h) => sum + (h.result?.total || 0), 0);

  let totalDurationSec = 0, durationCount = 0;
  for (const h of completed) {
    const dur = h.result?.duration;
    if (!dur) continue;
    let sec = 0;
    const minMatch = dur.match(/(\d+)분/);
    const secMatch = dur.match(/(\d+)초/);
    if (minMatch) sec += parseInt(minMatch[1]) * 60;
    if (secMatch) sec += parseInt(secMatch[1]);
    if (sec > 0) { totalDurationSec += sec; durationCount++; }
  }

  const siteMap = {};
  for (const h of history) {
    let host;
    try { host = new URL(h.url).hostname; } catch { host = h.url; }
    if (!siteMap[host]) siteMap[host] = { site: host, jobs: 0, images: 0 };
    siteMap[host].jobs++;
    if (h.status === 'completed') siteMap[host].images += (h.result?.total || 0);
  }
  const bySite = Object.values(siteMap).sort((a, b) => b.jobs - a.jobs).slice(0, 10);

  const kwMap = {};
  for (const h of history) {
    const kw = h.keyword || '(none)';
    if (!kwMap[kw]) kwMap[kw] = { keyword: kw, count: 0, images: 0 };
    kwMap[kw].count++;
    if (h.status === 'completed') kwMap[kw].images += (h.result?.total || 0);
  }
  const byKeyword = Object.values(kwMap).sort((a, b) => b.count - a.count).slice(0, 15);

  const daily = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayJobs = history.filter(h => h.createdAt?.startsWith(dateStr));
    const dayImages = dayJobs.filter(h => h.status === 'completed').reduce((s, h) => s + (h.result?.total || 0), 0);
    daily.push({ date: dateStr, jobs: dayJobs.length, images: dayImages });
  }

  return {
    overview: { totalJobs: total, successRate: total > 0 ? Math.round((completed.length / total) * 1000) / 10 : 0, totalImages, avgDurationSec: durationCount > 0 ? Math.round(totalDurationSec / durationCount) : 0, completed: completed.length, failed: failed.length },
    bySite, byKeyword, daily,
  };
}

function getRealtimeStatus(jobManager, history) {
  const allJobs = jobManager.getJobs();
  const running = allJobs.filter(j => j.status === 'running').map(j => ({
    id: j.id, url: j.url, keyword: j.keyword, lastEvent: j.lastEvent, startedAt: j.startedAt,
  }));
  const queued = allJobs.filter(j => j.status === 'queued').map(j => ({
    id: j.id, url: j.url, keyword: j.keyword, createdAt: j.createdAt,
  }));

  const recentCompleted = history
    .filter(h => h.status === 'completed' || h.status === 'failed')
    .slice(0, 5)
    .map(h => ({
      id: h.id, url: h.url, keyword: h.keyword, status: h.status,
      completedAt: h.completedAt, images: h.result?.total || 0, duration: h.result?.duration || '',
    }));

  const mem = process.memoryUsage();
  return {
    running, queued, recentCompleted,
    system: { cpu: getCpuPercent(), memoryMB: Math.round(mem.rss / (1024 * 1024)) },
  };
}

async function sendDiscordAlert(config, type, data) {
  if (!config?.discord?.enabled || !config?.discord?.webhookUrl) return;
  let content = '', color = 0x58a6ff;

  if (type === 'complete' && config.discord.notifyOnComplete) {
    color = 0x3fb950;
    content = `**작업 완료**\n${data.url}\n${data.keyword || '(없음)'}\n${data.result?.total || 0}장 | ${data.result?.duration || ''}`;
  } else if (type === 'fail' && config.discord.notifyOnFail) {
    color = 0xf85149;
    content = `**작업 실패**\n${data.url}\n${data.keyword || '(없음)'}\n${data.error || 'Unknown error'}`;
  } else if (type === 'disk_warning' && config.discord.notifyOnDiskWarning) {
    color = 0xd29922;
    content = `**디스크 경고**\n남은 용량: ${data.freeMB}MB\n임계값: ${data.thresholdMB}MB`;
  } else if (type === 'test') {
    content = 'WebClaw 알림 테스트\nDiscord 알림이 정상 작동합니다!';
  } else {
    return;
  }

  try {
    const res = await fetch(config.discord.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [{ description: content, color, footer: { text: 'WebClaw Monitor' }, timestamp: new Date().toISOString() }] }),
    });
    return res.ok;
  } catch { return false; }
}

function onJobEvent(type, jobData) {
  const config = loadConfig();
  if (type === 'complete') {
    sendDiscordAlert(config, 'complete', jobData);
    const disk = getDiskUsage();
    if (disk.diskFreeMB > 0 && disk.diskFreeMB < config.discord.diskWarningThresholdMB) {
      sendDiscordAlert(config, 'disk_warning', { freeMB: disk.diskFreeMB, thresholdMB: config.discord.diskWarningThresholdMB });
    }
  } else if (type === 'fail') {
    sendDiscordAlert(config, 'fail', jobData);
  }
}

module.exports = { init, loadConfig, saveConfig, collectSystemMetrics, aggregateStats, getRealtimeStatus, sendDiscordAlert, onJobEvent };
