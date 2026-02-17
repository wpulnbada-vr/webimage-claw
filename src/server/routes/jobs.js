const express = require('express');
const router = express.Router();

module.exports = function(jobManager) {
  // GET /api/jobs — List active jobs
  router.get('/', (req, res) => {
    res.json(jobManager.getJobs());
  });

  // GET /api/jobs/:id — Single job detail
  router.get('/:id', (req, res) => {
    const job = jobManager.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  });

  // GET /api/jobs/:id/summary — CLI-friendly plain text summary
  router.get('/:id/summary', (req, res) => {
    const summary = jobManager.getJobSummary(req.params.id);
    if (!summary) {
      return res.status(404).type('text/plain').send('Job not found.');
    }
    res.type('text/plain').send(summary);
  });

  // POST /api/abort/:id — Abort job
  router.post('/', (req, res, next) => { next(); }); // pass through

  // DELETE /api/jobs/:id — Delete job
  router.delete('/:id', (req, res) => {
    const result = jobManager.deleteJob(req.params.id);
    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(result);
  });

  return router;
};
