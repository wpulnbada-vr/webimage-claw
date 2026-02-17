const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

module.exports = function(downloadsDir) {
  // GET /browse/:folder — Lightweight paginated image gallery
  router.get('/:folder', (req, res) => {
    const folder = req.params.folder;
    const dir = path.join(downloadsDir, folder);
    if (!fs.existsSync(dir)) {
      return res.status(404).send('Folder not found');
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 200;
    const allFiles = fs.readdirSync(dir)
      .filter(f => /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(f))
      .sort();
    const totalFiles = allFiles.length;
    const totalPages = Math.ceil(totalFiles / perPage) || 1;
    const files = allFiles.slice((page - 1) * perPage, page * perPage);

    let paginationHtml = '';
    if (totalPages > 1) {
      const links = [];
      if (page > 1) links.push(`<a href="?page=${page - 1}">&laquo; Prev</a>`);
      const start = Math.max(1, page - 3);
      const end = Math.min(totalPages, page + 3);
      if (start > 1) links.push(`<a href="?page=1">1</a>`);
      if (start > 2) links.push('<span>...</span>');
      for (let i = start; i <= end; i++) {
        links.push(i === page ? `<span class="current">${i}</span>` : `<a href="?page=${i}">${i}</a>`);
      }
      if (end < totalPages - 1) links.push('<span>...</span>');
      if (end < totalPages) links.push(`<a href="?page=${totalPages}">${totalPages}</a>`);
      if (page < totalPages) links.push(`<a href="?page=${page + 1}">Next &raquo;</a>`);
      paginationHtml = `<div class="pagination">${links.join(' ')}</div>`;
    }

    const imagesHtml = files.map(f => {
      const url = `/downloads/${encodeURIComponent(folder)}/${encodeURIComponent(f)}`;
      return `<div class="img-card"><a href="${url}" target="_blank"><img loading="lazy" src="${url}" alt="${f}"></a><div class="name">${f}</div></div>`;
    }).join('\n');

    res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${folder} (${totalFiles} images)</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1a2e;color:#e0e0e0;font-family:system-ui,sans-serif;padding:16px}
h1{font-size:1.2rem;margin-bottom:4px;color:#fff}
.info{font-size:.85rem;color:#888;margin-bottom:12px}
.info a{color:#64b5f6;text-decoration:none}
.info a:hover{text-decoration:underline}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.img-card{background:#16213e;border-radius:6px;overflow:hidden;transition:transform .15s}
.img-card:hover{transform:scale(1.02)}
.img-card img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.img-card .name{padding:4px 6px;font-size:.7rem;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pagination{text-align:center;padding:16px 0;display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
.pagination a,.pagination span{padding:6px 12px;border-radius:4px;text-decoration:none;font-size:.85rem}
.pagination a{background:#16213e;color:#64b5f6}
.pagination a:hover{background:#1a3a5c}
.pagination .current{background:#64b5f6;color:#fff;font-weight:bold}
</style></head><body>
<h1>${folder}</h1>
<div class="info">${totalFiles} images &middot; Page ${page}/${totalPages} &middot; <a href="/api/zip/${encodeURIComponent(folder)}" download="${folder}.zip">Download ZIP</a> &middot; <a href="/downloads/${encodeURIComponent(folder)}/">Raw file list</a></div>
${paginationHtml}
<div class="grid">${imagesHtml}</div>
${paginationHtml}
</body></html>`);
  });

  return router;
};
