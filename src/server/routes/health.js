const express = require('express');
const os = require('os');
const router = express.Router();

module.exports = function(jobManager) {
  // GET /api/health — Server status and stats
  router.get('/', (req, res) => {
    const jobs = jobManager.getJobs();
    const running = jobs.filter(j => j.status === 'running').length;
    const queued = jobs.filter(j => j.status === 'queued').length;
    const completed = jobs.filter(j => j.status === 'completed').length;

    res.json({
      status: 'ok',
      version: '0.2.0',
      uptime: Math.floor(process.uptime()),
      hostname: os.hostname(),
      jobs: { running, queued, completed, total: jobs.length },
    });
  });

  return router;
};
