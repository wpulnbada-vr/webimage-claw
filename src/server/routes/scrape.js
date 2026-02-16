const express = require('express');
const router = express.Router();

module.exports = function(jobManager) {
  // POST /api/scrape — Create new scraping job
  router.post('/', (req, res) => {
    const { url, keyword } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const result = jobManager.createJob(url, keyword);
    if (result.error === 'duplicate') {
      return res.status(409).json(result);
    }

    res.json(result);
  });

  return router;
};
