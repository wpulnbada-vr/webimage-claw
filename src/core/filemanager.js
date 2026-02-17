const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const multer = require('multer');

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function createRouter(authMiddleware, downloadsDir) {
  const BASE_DIR = downloadsDir;
  const router = express.Router();

  function safePath(userPath) {
    const cleaned = (userPath || '').replace(/^\/+/, '');
    const resolved = path.resolve(BASE_DIR, cleaned);
    if (!resolved.startsWith(BASE_DIR)) return null;
    return resolved;
  }

  router.use(authMiddleware);

  const upload = multer({ dest: path.join(BASE_DIR, '..', '.uploads-tmp') });

  router.get('/', (req, res) => {
    const dirPath = safePath(req.query.path || '/');
    if (!dirPath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(dirPath)) return res.status(404).json({ error: 'Path not found' });

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries.map(entry => {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const s = fs.statSync(fullPath);
        return { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file', size: entry.isDirectory() ? null : s.size, mtime: s.mtime.toISOString() };
      } catch {
        return { name: entry.name, type: 'file', size: 0, mtime: null };
      }
    });

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const relativePath = path.relative(BASE_DIR, dirPath);
    res.json({ path: !relativePath || relativePath === '.' ? '/' : '/' + relativePath, items });
  });

  router.get('/stats', (req, res) => {
    if (!fs.existsSync(BASE_DIR)) return res.json({ folders: 0, files: 0, totalSize: '0 B' });

    let folders = 0, files = 0, totalSize = 0;
    const topEntries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
    for (const entry of topEntries) {
      if (entry.isDirectory()) {
        folders++;
        try {
          const dirFiles = fs.readdirSync(path.join(BASE_DIR, entry.name));
          files += dirFiles.length;
          for (const f of dirFiles) {
            try { totalSize += fs.statSync(path.join(BASE_DIR, entry.name, f)).size; } catch {}
          }
        } catch {}
      } else {
        files++;
        try { totalSize += fs.statSync(path.join(BASE_DIR, entry.name)).size; } catch {}
      }
    }
    res.json({ folders, files, totalSize: formatSize(totalSize), totalBytes: totalSize });
  });

  router.get('/download', (req, res) => {
    const filePath = safePath(req.query.path);
    if (!filePath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    if (fs.statSync(filePath).isDirectory()) return res.status(400).json({ error: 'Cannot download directory directly' });
    res.download(filePath);
  });

  router.post('/download-zip', (req, res) => {
    const { paths } = req.body;
    if (!Array.isArray(paths) || paths.length === 0) return res.status(400).json({ error: 'No paths provided' });

    const safePaths = paths.map(p => safePath(p)).filter(Boolean);
    if (safePaths.length === 0) return res.status(400).json({ error: 'Invalid paths' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="download.zip"');

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.pipe(res);
    for (const p of safePaths) {
      if (!fs.existsSync(p)) continue;
      const stat = fs.statSync(p);
      const name = path.basename(p);
      if (stat.isDirectory()) archive.directory(p, name);
      else archive.file(p, { name });
    }
    archive.finalize();
  });

  router.post('/upload', upload.array('files', 50), (req, res) => {
    const targetDir = safePath(req.query.path || '/');
    if (!targetDir) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(targetDir)) return res.status(404).json({ error: 'Target directory not found' });

    const uploaded = [];
    for (const file of req.files || []) {
      const dest = path.join(targetDir, file.originalname);
      if (!dest.startsWith(BASE_DIR)) { fs.unlinkSync(file.path); continue; }
      fs.renameSync(file.path, dest);
      uploaded.push(file.originalname);
    }
    res.json({ uploaded });
  });

  router.post('/mkdir', (req, res) => {
    const dirPath = safePath(req.body.path);
    if (!dirPath) return res.status(400).json({ error: 'Invalid path' });
    if (fs.existsSync(dirPath)) return res.status(409).json({ error: 'Already exists' });
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ ok: true });
  });

  router.delete('/', (req, res) => {
    const targetPath = safePath(req.query.path);
    if (!targetPath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'Not found' });
    if (targetPath === BASE_DIR) return res.status(400).json({ error: 'Cannot delete root downloads directory' });

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) fs.rmSync(targetPath, { recursive: true, force: true });
    else fs.unlinkSync(targetPath);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createRouter };
