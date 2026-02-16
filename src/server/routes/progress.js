const express = require('express');
const router = express.Router();

module.exports = function(jobManager) {
  // GET /api/progress/:jobId — SSE stream
  router.get('/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const job = jobManager.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send past events
    const memJob = jobManager.jobs.get(jobId);
    if (memJob) {
      for (const event of memJob.events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'aborted') {
      res.end();
      return;
    }

    // Subscribe to future events
    const unsubscribe = jobManager.subscribeToJob(jobId, (event) => {
      if (event.type === 'close') {
        res.end();
        return;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  return router;
};
