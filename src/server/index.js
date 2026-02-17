const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const serveIndex = require('serve-index');

const JobManager = require('../core/job-manager');
const scrapeRoute = require('./routes/scrape');
const progressRoute = require('./routes/progress');
const jobsRoute = require('./routes/jobs');
const filesRoute = require('./routes/files');
const { zipRoute } = require('./routes/files');
const healthRoute = require('./routes/health');
const browseRoute = require('./routes/browse');

/**
 * Start the WebImageClaw Express server.
 * @param {object} options
 * @param {number} options.port
 * @param {string} options.host
 * @param {string} options.downloadsDir
 * @param {string} options.historyFile
 * @param {string} options.publicDir
 * @param {string} [options.chromePath]
 * @returns {Promise<{app, server, port, jobManager}>}
 */
function startServer(options = {}) {
  const {
    port = 3100,
    host = '0.0.0.0',
    downloadsDir = path.join(__dirname, '..', '..', 'downloads'),
    historyFile = path.join(__dirname, '..', '..', 'history.json'),
    publicDir = path.join(__dirname, '..', '..', 'public'),
    chromePath,
  } = options;

  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const jobManager = new JobManager({
    maxConcurrent: 2,
    historyFile,
    downloadsDir,
    chromePath,
  });

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(publicDir));
  app.use('/downloads', express.static(downloadsDir), serveIndex(downloadsDir, { icons: true }));

  // API routes
  app.use('/api/scrape', scrapeRoute(jobManager));
  app.use('/api/progress', progressRoute(jobManager));
  app.use('/api/jobs', jobsRoute(jobManager));
  app.use('/api/files', filesRoute(downloadsDir));
  app.use('/api/zip', zipRoute(downloadsDir));
  app.use('/api/health', healthRoute(jobManager));
  app.use('/api/history', (req, res) => res.json(jobManager.getHistory()));
  app.use('/browse', browseRoute(downloadsDir));

  // POST /api/abort/:id (separate from jobs route for backwards compat)
  app.post('/api/abort/:id', (req, res) => {
    const result = jobManager.abortJob(req.params.id);
    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(result);
  });

  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      console.log(`[WebImageClaw] http://${host}:${port}`);
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
