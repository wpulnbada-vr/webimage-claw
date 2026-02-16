const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const router = express.Router();

module.exports = function(downloadsDir) {
  // GET /api/files/:folder — List image files in folder
  router.get('/:folder', (req, res) => {
    const folder = req.params.folder;
    const dir = path.join(downloadsDir, folder);
    if (!fs.existsSync(dir)) {
      return res.json([]);
    }
    const files = fs.readdirSync(dir)
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .sort()
      .map(f => ({
        name: f,
        url: `/downloads/${encodeURIComponent(folder)}/${encodeURIComponent(f)}`,
      }));
    res.json(files);
  });

  return router;
};

module.exports.zipRoute = function(downloadsDir) {
  const zipRouter = express.Router();

  // GET /api/zip/:folder — Download folder as ZIP
  zipRouter.get('/:folder', (req, res) => {
    const folder = req.params.folder;
    const dir = path.join(downloadsDir, folder);
    if (!fs.existsSync(dir)) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
    if (files.length === 0) {
      return res.status(404).json({ error: 'No images in folder' });
    }

    res.setHeader('Content-Type', 'application/zip');
    const safeFilename = encodeURIComponent(folder) + '.zip';
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}; filename="${safeFilename}"`);

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.pipe(res);

    for (const file of files) {
      archive.file(path.join(dir, file), { name: file });
    }

    archive.finalize();
  });

  return zipRouter;
};
