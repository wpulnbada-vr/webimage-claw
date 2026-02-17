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

  // GET / — List directory with sort & childCount
  router.get('/', (req, res) => {
    const dirPath = safePath(req.query.path || '/');
    if (!dirPath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(dirPath)) return res.status(404).json({ error: 'Path not found' });

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });

    const sortBy = req.query.sortBy || 'name';
    const order = req.query.order || 'asc';

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries.map(entry => {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const s = fs.statSync(fullPath);
        const item = {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isDirectory() ? null : s.size,
          mtime: s.mtime.toISOString(),
        };
        if (entry.isDirectory()) {
          try {
            item.childCount = fs.readdirSync(fullPath).length;
          } catch { item.childCount = 0; }
        }
        return item;
      } catch {
        return { name: entry.name, type: 'file', size: 0, mtime: null };
      }
    });

    // Sort: directories first, then by selected field
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      let cmp = 0;
      switch (sortBy) {
        case 'size':
          cmp = (a.size || 0) - (b.size || 0);
          break;
        case 'date':
          cmp = (a.mtime || '').localeCompare(b.mtime || '');
          break;
        case 'type': {
          const extA = path.extname(a.name).toLowerCase();
          const extB = path.extname(b.name).toLowerCase();
          cmp = extA.localeCompare(extB);
          break;
        }
        default:
          cmp = a.name.localeCompare(b.name);
      }
      return order === 'desc' ? -cmp : cmp;
    });

    const relativePath = path.relative(BASE_DIR, dirPath);
    res.json({ path: !relativePath || relativePath === '.' ? '/' : '/' + relativePath, items });
  });

  // GET /search — Recursive filename search
  router.get('/search', (req, res) => {
    const query = (req.query.q || '').trim().toLowerCase();
    if (!query) return res.status(400).json({ error: 'Query parameter "q" is required' });

    const scopePath = safePath(req.query.path || '/');
    if (!scopePath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(scopePath)) return res.status(404).json({ error: 'Path not found' });

    const MAX_RESULTS = 200;
    const results = [];

    function searchDir(dir) {
      if (results.length >= MAX_RESULTS) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) return;
        const fullPath = path.join(dir, entry.name);
        const relativeToBASE = path.relative(BASE_DIR, fullPath);
        const itemPath = '/' + relativeToBASE;
        if (entry.name.toLowerCase().includes(query)) {
          try {
            const s = fs.statSync(fullPath);
            results.push({
              name: entry.name,
              path: itemPath,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: entry.isDirectory() ? null : s.size,
              mtime: s.mtime.toISOString(),
            });
          } catch {}
        }
        if (entry.isDirectory()) {
          searchDir(fullPath);
        }
      }
    }

    searchDir(scopePath);
    res.json({ query, total: results.length, results });
  });

  // GET /stats — Overall stats
  router.get('/stats', (req, res) => {
    if (!fs.existsSync(BASE_DIR)) return res.json({ folders: 0, files: 0, totalSize: '0 B' });

    let folders = 0, files = 0, totalSize = 0;
    const topEntries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
    for (const entry of topEntries) {
      if (entry.isDirectory()) {
        folders++;
        const dirFullPath = path.join(BASE_DIR, entry.name);
        try {
          const dirFiles = fs.readdirSync(dirFullPath);
          files += dirFiles.length;
          for (const f of dirFiles) {
            try { totalSize += fs.statSync(path.join(dirFullPath, f)).size; } catch {}
          }
        } catch {}
      } else {
        files++;
        try { totalSize += fs.statSync(path.join(BASE_DIR, entry.name)).size; } catch {}
      }
    }
    res.json({ folders, files, totalSize: formatSize(totalSize), totalBytes: totalSize });
  });

  // GET /download — Single file download
  router.get('/download', (req, res) => {
    const filePath = safePath(req.query.path);
    if (!filePath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    if (fs.statSync(filePath).isDirectory()) return res.status(400).json({ error: 'Cannot download directory directly' });
    res.download(filePath);
  });

  // POST /download-zip — Multiple files/folders as ZIP
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

  // POST /upload — Upload files
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

  // POST /mkdir — Create directory
  router.post('/mkdir', (req, res) => {
    const dirPath = safePath(req.body.path);
    if (!dirPath) return res.status(400).json({ error: 'Invalid path' });
    if (fs.existsSync(dirPath)) return res.status(409).json({ error: 'Already exists' });
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ ok: true });
  });

  // POST /rename — Rename file or folder
  router.post('/rename', (req, res) => {
    const { oldPath, newName } = req.body;
    if (!oldPath || !newName) return res.status(400).json({ error: 'oldPath and newName are required' });
    if (newName.includes('/') || newName.includes('\\')) return res.status(400).json({ error: 'Invalid name' });

    const oldFullPath = safePath(oldPath);
    if (!oldFullPath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(oldFullPath)) return res.status(404).json({ error: 'Not found' });
    if (oldFullPath === BASE_DIR) return res.status(400).json({ error: 'Cannot rename root' });

    const newFullPath = path.join(path.dirname(oldFullPath), newName);
    if (!newFullPath.startsWith(BASE_DIR)) return res.status(400).json({ error: 'Invalid target path' });
    if (fs.existsSync(newFullPath)) return res.status(409).json({ error: 'Name already exists' });

    fs.renameSync(oldFullPath, newFullPath);
    res.json({ ok: true });
  });

  // POST /copy — Copy file or folder
  router.post('/copy', (req, res) => {
    const { sourcePath, destPath } = req.body;
    if (!sourcePath || !destPath) return res.status(400).json({ error: 'sourcePath and destPath are required' });

    const srcFull = safePath(sourcePath);
    const dstFull = safePath(destPath);
    if (!srcFull || !dstFull) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(srcFull)) return res.status(404).json({ error: 'Source not found' });

    if (fs.statSync(srcFull).isDirectory() && dstFull.startsWith(srcFull + path.sep)) {
      return res.status(400).json({ error: 'Cannot copy a folder into itself' });
    }

    let finalDest = dstFull;
    if (fs.existsSync(finalDest)) {
      const dir = path.dirname(finalDest);
      const ext = path.extname(finalDest);
      const base = path.basename(finalDest, ext);
      let n = 1;
      while (fs.existsSync(finalDest)) {
        finalDest = path.join(dir, `${base} (${n})${ext}`);
        n++;
      }
    }

    if (fs.statSync(srcFull).isDirectory()) {
      fs.cpSync(srcFull, finalDest, { recursive: true });
    } else {
      fs.copyFileSync(srcFull, finalDest);
    }
    res.json({ ok: true, dest: '/' + path.relative(BASE_DIR, finalDest) });
  });

  // POST /move — Move file or folder
  router.post('/move', (req, res) => {
    const { sourcePath, destPath } = req.body;
    if (!sourcePath || !destPath) return res.status(400).json({ error: 'sourcePath and destPath are required' });

    const srcFull = safePath(sourcePath);
    const dstFull = safePath(destPath);
    if (!srcFull || !dstFull) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(srcFull)) return res.status(404).json({ error: 'Source not found' });
    if (srcFull === BASE_DIR) return res.status(400).json({ error: 'Cannot move root' });

    if (fs.statSync(srcFull).isDirectory() && dstFull.startsWith(srcFull + path.sep)) {
      return res.status(400).json({ error: 'Cannot move a folder into itself' });
    }

    let finalDest = dstFull;
    if (fs.existsSync(finalDest)) {
      const dir = path.dirname(finalDest);
      const ext = path.extname(finalDest);
      const base = path.basename(finalDest, ext);
      let n = 1;
      while (fs.existsSync(finalDest)) {
        finalDest = path.join(dir, `${base} (${n})${ext}`);
        n++;
      }
    }

    fs.renameSync(srcFull, finalDest);
    res.json({ ok: true, dest: '/' + path.relative(BASE_DIR, finalDest) });
  });

  // POST /share — Create share link
  router.post('/share', (req, res) => {
    const { filePath, hours } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });

    const fullPath = safePath(filePath);
    if (!fullPath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    const Auth = require('./auth');
    const token = Auth.generateShareToken(filePath, hours || 24);
    res.json({ token, url: `/api/share/${token}` });
  });

  // DELETE / — Delete file or folder
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
