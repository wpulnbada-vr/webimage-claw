const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
// serve-index removed for security

const JobManager = require('../core/job-manager');
const Auth = require('../core/auth');
const Monitor = require('../core/monitor');
const FileManagerModule = require('../core/filemanager');
const scrapeRoute = require('./routes/scrape');
const progressRoute = require('./routes/progress');
const jobsRoute = require('./routes/jobs');
const filesRoute = require('./routes/files');
const { zipRoute } = require('./routes/files');
const healthRoute = require('./routes/health');
const browseRoute = require('./routes/browse');

/**
 * Start the WebClaw Express server.
 */
function startServer(options = {}) {
  const {
    port = 3100,
    host = '0.0.0.0',
    downloadsDir = path.join(__dirname, '..', '..', 'downloads'),
    historyFile = path.join(__dirname, '..', '..', 'history.json'),
    publicDir = path.join(__dirname, '..', '..', 'public'),
    chromePath,
    configDir,
  } = options;

  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  // Initialize modules
  const cfgDir = configDir || path.dirname(historyFile);
  Auth.init(cfgDir);
  Monitor.init(cfgDir, downloadsDir);

  const serverStartTime = new Date().toISOString();

  const jobManager = new JobManager({
    maxConcurrent: 2,
    historyFile,
    downloadsDir,
    chromePath,
  });

  // Monitor integration: hook into job events
  jobManager.on('job:completed', (jobId) => {
    const job = jobManager.getJob(jobId);
    if (job) Monitor.onJobEvent('complete', job);
  });
  jobManager.on('job:failed', (jobId, error) => {
    const job = jobManager.getJob(jobId);
    if (job) Monitor.onJobEvent('fail', job);
  });

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(express.static(publicDir));
  // /downloads — auth-protected static file serving
  app.use('/downloads', Auth.authMiddleware, express.static(downloadsDir));

  // --- Public API (no auth) ---
  app.use('/api/scrape', scrapeRoute(jobManager));
  app.use('/api/progress', progressRoute(jobManager));
  app.use('/api/jobs', jobsRoute(jobManager));
  app.use('/api/files', filesRoute(downloadsDir));
  app.use('/api/zip', zipRoute(downloadsDir));
  app.use('/api/health', healthRoute(jobManager));
  app.use('/api/history', (req, res, next) => {
    if (req.method === 'DELETE') {
      // Clear all history
      jobManager._saveHistory([]);
      return res.json({ ok: true });
    }
    res.json(jobManager.getHistory());
  });
  app.use('/browse', Auth.authMiddleware, browseRoute(downloadsDir));

  // POST /api/abort/:id
  app.post('/api/abort/:id', (req, res) => {
    const result = jobManager.abortJob(req.params.id);
    if (result.error === 'not_found') return res.status(404).json({ error: 'Job not found' });
    res.json(result);
  });

  // --- Auth API (public endpoints for setup/login) ---
  app.get('/api/auth/status', (req, res) => {
    const setupComplete = Auth.isSetupComplete();
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers.authorization;
    let authenticated = false;
    if (apiKey && Auth.verifyApiKey(apiKey)) authenticated = true;
    if (authHeader && authHeader.startsWith('Bearer ') && Auth.verifyToken(authHeader.slice(7))) authenticated = true;
    res.json({ setupComplete, authenticated });
  });

  app.post('/api/auth/setup', async (req, res) => {
    if (Auth.isSetupComplete()) return res.status(400).json({ error: 'Already configured' });
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    await Auth.createAdmin(password);
    const token = Auth.generateToken();
    res.json({ ok: true, token });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { password } = req.body;
    const valid = await Auth.verifyPassword(password);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });
    const token = Auth.generateToken();
    res.json({ ok: true, token });
  });

  // --- Auth-protected endpoints ---
  app.post('/api/auth/api-keys', Auth.authMiddleware, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const entry = Auth.generateApiKey(name);
    res.json(entry);
  });

  app.get('/api/auth/api-keys', Auth.authMiddleware, (req, res) => {
    res.json(Auth.listApiKeys());
  });

  app.delete('/api/auth/api-keys/:id', Auth.authMiddleware, (req, res) => {
    const ok = Auth.deleteApiKey(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Key not found' });
    res.json({ ok: true });
  });

  // --- Share (public, no auth) ---
  app.get('/api/share/:token', (req, res) => {
    const link = Auth.verifyShareToken(req.params.token);
    if (!link) return res.status(404).json({ error: 'Link expired or not found' });

    const filePath = path.join(downloadsDir, link.filePath.replace(/^\/+/, ''));
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(downloadsDir)) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });

    res.download(resolved);
  });

  // --- File Manager API (auth-protected) ---
  app.use('/api/filemanager', FileManagerModule.createRouter(Auth.authMiddleware, downloadsDir));

  // --- Monitor API ---
  app.get('/api/monitor/system', (req, res) => {
    res.json(Monitor.collectSystemMetrics(jobManager, serverStartTime));
  });

  app.get('/api/monitor/stats', (req, res) => {
    const history = jobManager.getHistory();
    res.json(Monitor.aggregateStats(history));
  });

  app.get('/api/monitor/realtime', (req, res) => {
    const history = jobManager.getHistory();
    res.json(Monitor.getRealtimeStatus(jobManager, history));
  });

  app.get('/api/monitor/config', (req, res) => {
    const config = Monitor.loadConfig();
    const masked = { ...config.discord };
    if (masked.webhookUrl) masked.webhookUrl = masked.webhookUrl.slice(0, 20) + '...' + masked.webhookUrl.slice(-10);
    res.json(masked);
  });

  app.post('/api/monitor/config', Auth.authMiddleware, (req, res) => {
    try {
      const config = Monitor.loadConfig();
      const { webhookUrl, enabled, notifyOnComplete, notifyOnFail, notifyOnDiskWarning, diskWarningThresholdMB } = req.body;
      if (webhookUrl !== undefined) config.discord.webhookUrl = webhookUrl;
      if (enabled !== undefined) config.discord.enabled = enabled;
      if (notifyOnComplete !== undefined) config.discord.notifyOnComplete = notifyOnComplete;
      if (notifyOnFail !== undefined) config.discord.notifyOnFail = notifyOnFail;
      if (notifyOnDiskWarning !== undefined) config.discord.notifyOnDiskWarning = notifyOnDiskWarning;
      if (diskWarningThresholdMB !== undefined) config.discord.diskWarningThresholdMB = diskWarningThresholdMB;
      Monitor.saveConfig(config);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/monitor/test-alert', Auth.authMiddleware, async (req, res) => {
    const config = Monitor.loadConfig();
    if (!config.discord.webhookUrl) return res.status(400).json({ error: 'No webhook URL configured' });
    const ok = await Monitor.sendDiscordAlert(config, 'test', {});
    res.json({ ok: !!ok });
  });

  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      console.log(`[WebClaw] http://${host}:${port}`);
      jobManager.recoverOrphanedJobs();
      resolve({ app, server, port, jobManager });
    });
  });
}

// Standalone mode
if (require.main === module) {
  startServer({
    port: parseInt(process.env.PORT) || 3100,
    host: process.env.HOST || '0.0.0.0',
    downloadsDir: process.env.DOWNLOADS_DIR || path.join(__dirname, '..', '..', 'downloads'),
    historyFile: process.env.HISTORY_FILE || path.join(__dirname, '..', '..', 'history.json'),
    publicDir: path.join(__dirname, '..', '..', 'public'),
  });
}

module.exports = { startServer };
