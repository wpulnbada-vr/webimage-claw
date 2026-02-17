const { EventEmitter } = require('events');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const sanitize = require('sanitize-filename');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const { findChrome } = require('./chrome-finder');
const { EXCLUDE_PATTERNS, BLOCKED_SCRIPTS, IMAGE_EXTENSIONS } = require('./constants');

puppeteer.use(StealthPlugin());

const sleep = ms => new Promise(r => setTimeout(r, ms));

function extractAlbumName(title, keyword) {
  if (!title || title === 'Direct URL') return '';
  let album = title;
  if (keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    album = album.replace(new RegExp(escaped, 'gi'), '');
  }
  album = album.replace(/\[[^\]]*\]\s*/g, '');
  album = album.replace(/^[\s\-–—|:,·]+|[\s\-–—|:,·]+$/g, '').trim();
  album = sanitize(album).replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (album.length > 50) album = album.substring(0, 50).replace(/_$/, '');
  return album;
}

class ImageScraper extends EventEmitter {
  constructor() {
    super();
    this.browser = null;
    this.page = null;
    this.aborted = false;
    this._jsDisabledMode = false;
    this._cdp = null;
    this._capturedImages = new Map();
    this._imageCache = new Map();
  }

  emit(type, data) {
    super.emit('progress', { type, ...data });
  }

  async scrape(url, keyword, options = {}) {
    const {
      minWidth = 400,
      minHeight = 400,
      minFileSize = 5000,
      concurrency = 3,
      maxPages = 50,
      downloadDir = path.join(__dirname, '..', '..', 'downloads'),
      chromePath,
    } = options;

    const resolvedChromePath = chromePath || findChrome();

    const folderName = sanitize(keyword || 'unnamed').replace(/\s+/g, '_').toLowerCase();
    const saveDir = path.join(downloadDir, folderName);
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

    const startTime = Date.now();
    let totalDownloaded = 0;

    try {
      this.emit('status', { message: 'Launching browser...' });
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-popup-blocking',
          '--disable-notifications',
        ],
        executablePath: resolvedChromePath,
      });

      this.browser.on('targetcreated', async (target) => {
        try {
          const p = await target.page();
          if (p) {
            const allPages = await this.browser.pages();
            if (allPages.length > 1 && p !== this.page) {
              await p.close();
            }
          }
        } catch {}
      });

      this.page = (await this.browser.pages())[0];
      await this.page.setViewport({ width: 1920, height: 1080 });

      this._cdp = await this.page.createCDPSession();
      await this._cdp.send('Network.enable');
      this._cdp.on('Network.responseReceived', (params) => {
        const url = params.response.url;
        if (IMAGE_EXTENSIONS.test(url) || /\.gif(\?|$)/i.test(url)) {
          this._capturedImages.set(url, { requestId: params.requestId, status: params.response.status });
        }
      });

      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        const reqUrl = req.url().toLowerCase();
        if (BLOCKED_SCRIPTS.some(s => reqUrl.includes(s))) {
          req.abort();
        } else {
          req.continue();
        }
      });

      this.emit('status', { message: `Navigating to ${url}...` });
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const cfPassed = await this._waitForCloudflare();
      if (!cfPassed) {
        this.emit('error', { message: 'Cloudflare bypass failed (30s timeout)' });
        return { success: false, total: 0, folder: saveDir };
      }

      let posts = [];
      if (keyword) {
        this.emit('status', { message: `Searching for "${keyword}"...` });
        posts = await this._searchPosts(url, keyword, maxPages);
        this.emit('search', { pages: posts._pageCount || 1, posts: posts.length });
      } else {
        posts = [{ url, title: 'Direct URL' }];
      }

      if (posts.length === 0) {
        this.emit('status', { message: 'No search results found.' });
        this.emit('complete', { total: 0, folder: folderName, duration: this._duration(startTime) });
        return { success: true, total: 0, folder: saveDir };
      }

      const allImageUrls = new Set();
      let existingCount = fs.readdirSync(saveDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f)).length;
      let fileCounter = existingCount;

      for (let i = 0; i < posts.length; i++) {
        if (this.aborted) break;
        const post = posts[i];
        this.emit('post', { current: i + 1, total: posts.length, title: post.title });

        const albumName = extractAlbumName(post.title, keyword);
        const imgs = await this._getPostImages(post.url, minWidth, minHeight);
        const newImgs = imgs.filter(u => !allImageUrls.has(u));
        newImgs.forEach(u => allImageUrls.add(u));

        if (newImgs.length > 0) {
          this.emit('found', { count: newImgs.length, message: `${newImgs.length} images found` });
        }

        if (newImgs.length > 0 && this._cdp && !this._jsDisabledMode) {
          const uncaptured = newImgs.filter(u => !this._capturedImages.has(u));
          if (uncaptured.length > 0) {
            for (let b = 0; b < uncaptured.length; b += 10) {
              if (this.aborted) break;
              const batch = uncaptured.slice(b, b + 10);
              await Promise.race([
                this.page.evaluate(async (urls) => {
                  const promises = urls.map(url => new Promise(resolve => {
                    const img = new Image();
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                    setTimeout(resolve, 8000);
                    img.src = url;
                  }));
                  await Promise.all(promises);
                }, batch),
                new Promise(r => setTimeout(r, 10000)),
              ]).catch(() => {});
            }
            await sleep(500);
          }
        }

        for (let j = 0; j < newImgs.length; j += concurrency) {
          if (this.aborted) break;
          const batch = newImgs.slice(j, j + concurrency);
          const results = await Promise.all(batch.map(async (imgUrl) => {
            try {
              const ext = this._getExtension(imgUrl);
              fileCounter++;
              const prefix = albumName ? `${folderName}_${albumName}` : folderName;
              const filename = `${prefix}_${String(fileCounter).padStart(4, '0')}${ext}`;
              const filepath = path.join(saveDir, filename);

              let downloaded = false;
              const cachedBuffer = this._imageCache.get(imgUrl);
              if (cachedBuffer) {
                fs.writeFileSync(filepath, cachedBuffer);
                this._imageCache.delete(imgUrl);
                downloaded = true;
              }
              if (!downloaded) {
                const captured = this._capturedImages.get(imgUrl);
                if (captured && captured.status === 200 && this._cdp) {
                  try {
                    const { body, base64Encoded } = await this._cdp.send('Network.getResponseBody', { requestId: captured.requestId });
                    const buffer = base64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body);
                    if (buffer.length > 0) {
                      fs.writeFileSync(filepath, buffer);
                      downloaded = true;
                    }
                  } catch {}
                }
              }
              if (!downloaded) {
                try {
                  await this._downloadImage(imgUrl, filepath, url);
                  downloaded = true;
                } catch {}
              }

              if (!downloaded) { fileCounter--; return false; }

              const stat = fs.statSync(filepath);
              if (stat.size < minFileSize) {
                fs.unlinkSync(filepath);
                fileCounter--;
                return false;
              }
              return true;
            } catch {
              fileCounter--;
              return false;
            }
          }));

          totalDownloaded += results.filter(Boolean).length;
          this.emit('download', {
            current: totalDownloaded,
            total: allImageUrls.size,
            filename: `${folderName}_${String(fileCounter).padStart(4, '0')}`,
          });
        }
      }

      const duration = this._duration(startTime);
      this.emit('complete', { total: totalDownloaded, folder: folderName, duration });
      return { success: true, total: totalDownloaded, folder: saveDir, duration };

    } catch (err) {
      this.emit('error', { message: err.message });
      return { success: false, total: totalDownloaded, error: err.message };
    } finally {
      await this._cleanup();
    }
  }

  async _waitForCloudflare() {
    const maxWait = 30;
    for (let i = 0; i < maxWait; i++) {
      const title = await this.page.title().catch(() => '');
      if (!title.includes('Just a moment') && !title.includes('Checking')) {
        this.emit('cf', { message: `Cloudflare passed! (${i}s)` });
        return true;
      }
      this.emit('cf', { message: `Cloudflare bypass in progress... (${i + 1}s)` });
      await sleep(1000);
    }
    return false;
  }

  async _safeGoto(url) {
    if (this._jsDisabledMode) {
      await this.page.setJavaScriptEnabled(false);
    }
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(1000);

    if (!this._jsDisabledMode) {
      const currentUrl = this.page.url();
      if (currentUrl === 'about:blank' || !currentUrl.startsWith('http')) {
        this._jsDisabledMode = true;
        this.emit('status', { message: 'Switching to JS-free mode' });
        await this.page.setJavaScriptEnabled(false);
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await sleep(1000);
      }
    }
  }

  async _getPageHtml() {
    if (!this._jsDisabledMode) {
      const openPages = await this.browser.pages();
      for (const p of openPages) {
        if (p !== this.page) { try { await p.close(); } catch {} }
      }
      await this.page.evaluate(async () => {
        for (let i = 0; i < 40; i++) {
          window.scrollBy(0, window.innerHeight);
          await new Promise(r => setTimeout(r, 150));
        }
        window.scrollTo(0, 0);
      }).catch(() => {});
      await sleep(1000);
    }
    return await this.page.content().catch(() => '');
  }

  async _searchPosts(baseUrl, keyword, maxPages) {
    const wpResults = await this._wpSearchPosts(baseUrl, keyword, maxPages);
    if (wpResults.length > 0) return wpResults;

    this.emit('status', { message: 'Switching to category browsing...' });
    return this._browseCategoryPosts(baseUrl, keyword, maxPages);
  }

  async _wpSearchPosts(baseUrl, keyword, maxPages) {
    const allPosts = [];
    let pageNum = 1;
    const origin = new URL(baseUrl).origin;
    let searchParams = null;

    while (pageNum <= maxPages) {
      if (this.aborted) break;

      let searchUrl;
      if (pageNum === 1) {
        searchUrl = `${origin}/?s=${encodeURIComponent(keyword)}`;
      } else if (searchParams) {
        searchUrl = `${origin}/page/${pageNum}${searchParams}`;
      } else {
        searchUrl = `${origin}/page/${pageNum}/?s=${encodeURIComponent(keyword)}`;
      }

      this.emit('status', { message: `Scanning search page ${pageNum}...` });

      try {
        await this._safeGoto(searchUrl);
        if (!this._jsDisabledMode) {
          await this.page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => {});
        }
      } catch { break; }

      if (!searchParams && pageNum === 1) {
        const currentUrl = this.page.url();
        try {
          const cu = new URL(currentUrl);
          if (cu.search && cu.search.includes('s=')) {
            searchParams = cu.search;
          }
        } catch {}
      }

      const html = await this._getPageHtml();
      if (html.includes('Page not found') || html.includes('Nothing Found') || html.length < 500) break;

      let posts = this._extractPostsFromHtml(html, origin);

      if (posts.length < 5 && !this._jsDisabledMode) {
        const domPosts = await this._extractPostsFromDOM(origin);
        if (domPosts.length > posts.length) posts = domPosts;
      }

      if (posts.length === 0) break;
      allPosts.push(...posts);

      const hasNext = html.includes(`/page/${pageNum + 1}`) || html.includes(`page=${pageNum + 1}`);
      if (!hasNext) break;
      pageNum++;
    }

    const seen = new Set();
    const result = allPosts.filter(p => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
    result._pageCount = pageNum;
    return result;
  }

  async _extractPostsFromDOM(origin) {
    return this.page.evaluate((orig) => {
      const results = [];
      const seen = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        if (!href || !href.startsWith(orig)) return;
        if (href.includes('/page/') || href.includes('/search/') || href.includes('?s=') || href.includes('?post_type=')) return;
        const pathname = new URL(href).pathname;
        if (/^\/[a-z][a-z0-9-]*\/?$/i.test(pathname)) return;
        if (pathname === '/' || pathname === '') return;
        const title = (a.textContent || '').trim();
        if (title.length < 5) return;
        if (/^\d+P?$/i.test(title)) return;
        if (href === orig || href === orig + '/') return;
        if (seen.has(href)) return;
        seen.add(href);
        results.push({ url: href, title: title.substring(0, 200) });
      });
      return results;
    }, origin).catch(() => []);
  }

  _extractPostsFromHtml(html, origin) {
    const results = [];
    const seen = new Set();

    for (const m of html.matchAll(/<h[23][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi)) {
      const href = m[1].startsWith('http') ? m[1] : origin + m[1];
      const title = m[2].trim();
      if (!href.startsWith(origin)) continue;
      if (href.includes('?s=') || href.includes('/page/') || href.includes('/search/')) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      results.push({ url: href, title: title.substring(0, 200) });
    }

    if (results.length === 0) {
      for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>[^]*?<h[23][^>]*>([^<]+)<\/h[23]>/gi)) {
        const href = m[1].startsWith('http') ? m[1] : origin + m[1];
        const title = m[2].trim();
        if (!href.startsWith(origin)) continue;
        if (href.includes('?s=') || href.includes('/page/') || href.includes('/search/')) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        results.push({ url: href, title: title.substring(0, 200) });
      }
    }

    if (results.length === 0) {
      for (const m of html.matchAll(/<p[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/p>/gi)) {
        const href = m[1].startsWith('http') ? m[1] : origin + m[1];
        const title = m[2].trim();
        if (title.length < 3) continue;
        if (!href.startsWith(origin)) continue;
        if (href.includes('?s=') || href.includes('/page/') || href.includes('/search/')) continue;
        if (/\.(html|php)$/i.test(new URL(href).pathname)) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        results.push({ url: href, title: title.substring(0, 200) });
      }
    }

    if (results.length === 0) {
      for (const m of html.matchAll(/<a[^>]+href=["']([^"']+\.html)["'][^>]*>([^<]{5,})<\/a>/gi)) {
        const href = m[1].startsWith('http') ? m[1] : origin + m[1];
        const title = m[2].trim();
        if (!href.startsWith(origin)) continue;
        if (href.includes('/page/') || href.includes('/search/') || href.includes('?s=')) continue;
        if (/^\d+P?$/i.test(title)) continue;
        if (title.length < 5) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        results.push({ url: href, title: title.substring(0, 200) });
      }
    }

    return results;
  }

  async _browseCategoryPosts(baseUrl, keyword, maxPages) {
    const allPosts = [];
    let pageNum = 1;
    const origin = new URL(baseUrl).origin;
    const kwLower = keyword.toLowerCase();
    let paginationStyle = null;

    while (pageNum <= maxPages) {
      if (this.aborted) break;

      let pageUrl;
      if (pageNum === 1) {
        pageUrl = baseUrl;
      } else if (paginationStyle === 'path') {
        const base = baseUrl.replace(/\/+$/, '');
        pageUrl = `${base}/page/${pageNum}`;
      } else {
        pageUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${pageNum}`;
      }

      this.emit('status', { message: `Scanning page ${pageNum}...` });

      try {
        await this._safeGoto(pageUrl);
        if (!this._jsDisabledMode) {
          await this.page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => {});
        }
      } catch { break; }

      const html = await this._getPageHtml();
      if (html.length < 500) break;

      if (paginationStyle === null) {
        if (html.includes('/page/2')) paginationStyle = 'path';
        else paginationStyle = 'query';
      }

      let posts = this._extractPostsFromHtml(html, origin);

      if (posts.length < 5 && !this._jsDisabledMode) {
        const domPosts = await this._extractPostsFromDOM(origin);
        if (domPosts.length > posts.length) {
          posts = domPosts;
        }
      }

      const matched = posts.filter(p => p.title.toLowerCase().includes(kwLower));
      if (matched.length > 0) {
        allPosts.push(...matched);
        this.emit('status', { message: `Page ${pageNum}: ${matched.length} matches (of ${posts.length} total)` });
      }

      const hasNext = html.includes(`page=${pageNum + 1}`) || html.includes(`/page/${pageNum + 1}`);
      if (!hasNext) break;
      if (posts.length === 0) break;
      pageNum++;
    }

    const seen = new Set();
    const result = allPosts.filter(p => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
    result._pageCount = pageNum;
    return result;
  }

  async _getPostImages(postUrl, minWidth, minHeight) {
    const allImages = new Set();
    const pagesToVisit = [postUrl];
    const visitedPages = new Set();

    while (pagesToVisit.length > 0) {
      const currentUrl = pagesToVisit.shift();
      if (visitedPages.has(currentUrl) || this.aborted) break;
      visitedPages.add(currentUrl);

      let pageImages = [];
      let html = '';

      const pageTimeout = new Promise(r => setTimeout(() => r('timeout'), 45000));
      const pageWork = (async () => {
        if (this._jsDisabledMode) {
          await this.page.setJavaScriptEnabled(false);
          await this.page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await sleep(800);
          html = await this.page.content().catch(() => '');
          pageImages = this._extractImagesFromHtml(html);
        } else {
          await this.page.setJavaScriptEnabled(true);
          await this.page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await sleep(1500);

          const currentPageUrl = this.page.url();
          if (currentPageUrl === 'about:blank' || !currentPageUrl.startsWith('http')) {
            this._jsDisabledMode = true;
            this.emit('status', { message: 'Switching to JS-free mode' });
            await this.page.setJavaScriptEnabled(false);
            await this.page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await sleep(800);
            html = await this.page.content().catch(() => '');
            pageImages = this._extractImagesFromHtml(html);
          } else {
            const openPages = await this.browser.pages();
            for (const p of openPages) {
              if (p !== this.page) { try { await p.close(); } catch {} }
            }

            await Promise.race([
              this.page.evaluate(async () => {
                for (let i = 0; i < 30; i++) {
                  window.scrollBy(0, window.innerHeight);
                  await new Promise(r => setTimeout(r, 120));
                }
                window.scrollTo(0, 0);
              }),
              new Promise(r => setTimeout(r, 8000)),
            ]).catch(() => {});
            await sleep(1000);

            await this.page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});

            pageImages = await Promise.race([
              this.page.evaluate((exPatterns, mw, mh) => {
                const images = new Set();
                document.querySelectorAll('img').forEach(img => {
                  const lazySrc = img.dataset.lazySrc || img.dataset.src || img.dataset.original || '';
                  const currentSrc = img.currentSrc || img.src || '';
                  const src = lazySrc || currentSrc;
                  if (!src || !src.startsWith('http')) return;
                  const lower = src.toLowerCase();
                  if (exPatterns.some(p => lower.includes(p))) return;
                  if (/-\d+x\d+\.\w+$/.test(src)) return;
                  const isLazy = !!lazySrc || img.loading === 'lazy' || img.classList.contains('lazyload');
                  const w = img.naturalWidth || img.width || 0;
                  const h = img.naturalHeight || img.height || 0;
                  if (isLazy || w >= mw || h >= mh) images.add(src);
                });
                document.querySelectorAll('img[srcset]').forEach(img => {
                  const srcset = img.getAttribute('srcset') || '';
                  srcset.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean).forEach(src => {
                    if (src.startsWith('http') && !/-\d+x\d+\.\w+$/.test(src)) images.add(src);
                  });
                });
                document.querySelectorAll('a[href]').forEach(a => {
                  const href = a.href;
                  if (!href || !href.startsWith('http')) return;
                  if (/\.(jpg|jpeg|png|webp|gif|bmp)(\?|$)/i.test(href)) {
                    const lower = href.toLowerCase();
                    if (exPatterns.some(p => lower.includes(p))) return;
                    if (/-\d+x\d+\.\w+$/.test(href)) return;
                    images.add(href);
                  }
                });
                return [...images];
              }, EXCLUDE_PATTERNS, minWidth, minHeight),
              new Promise(r => setTimeout(() => r([]), 10000)),
            ]).catch(() => []);

            if (pageImages.length === 0) {
              html = await this.page.content().catch(() => '');
              pageImages = this._extractImagesFromHtml(html);
            }
          }
        }
        return 'done';
      })();

      try {
        const result = await Promise.race([pageWork, pageTimeout]);
        if (result === 'timeout') {
          this.emit('status', { message: `Page timeout, skipping: ${currentUrl.split('/').pop()}` });
          await this.page.goto('about:blank', { timeout: 5000 }).catch(() => {});
          continue;
        }
      } catch (err) {
        if (!html) {
          try {
            await this.page.setJavaScriptEnabled(false);
            await this.page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            html = await this.page.content().catch(() => '');
            pageImages = this._extractImagesFromHtml(html);
          } catch {}
        }
      }

      pageImages.forEach(url => allImages.add(url));

      if (this._cdp && pageImages.length > 0) {
        const cacheStart = Date.now();
        for (const imgUrl of pageImages) {
          if (Date.now() - cacheStart > 10000) break;
          if (this._imageCache.has(imgUrl)) continue;
          const info = this._capturedImages.get(imgUrl);
          if (!info || info.status !== 200) continue;
          try {
            const { body, base64Encoded } = await this._cdp.send('Network.getResponseBody', { requestId: info.requestId });
            const buffer = base64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body);
            if (buffer.length > 0) this._imageCache.set(imgUrl, buffer);
          } catch {}
        }
      }

      if (visitedPages.size === 1) {
        if (!html) html = await this.page.content().catch(() => '');
        const baseHtml = postUrl.replace(/\/\d+$/, '');
        const escaped = baseHtml.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pageNums = [];

        html.replace(new RegExp(`href=["']${escaped}/(\\d+)["']`, 'g'), (_, num) => {
          pageNums.push({ num: parseInt(num), url: `${baseHtml}/${num}` });
        });

        if (postUrl.endsWith('.html')) {
          const htmlBase = postUrl.replace(/\.html$/, '');
          const htmlEscaped = htmlBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          html.replace(new RegExp(`href=["']${htmlEscaped}_(\\d+)\\.html["']`, 'g'), (_, num) => {
            pageNums.push({ num: parseInt(num), url: `${htmlBase}_${num}.html` });
          });
        }

        const seenNums = new Set();
        pageNums.sort((a, b) => a.num - b.num).forEach(({ num, url: nextUrl }) => {
          if (!seenNums.has(num) && !visitedPages.has(nextUrl)) {
            seenNums.add(num);
            pagesToVisit.push(nextUrl);
          }
        });
      }
    }
    return [...allImages];
  }

  _extractImagesFromHtml(html) {
    const images = new Set();
    for (const m of html.matchAll(/<img[^>]*>/gi)) {
      const tag = m[0];
      const urls = [];
      for (const attr of ['data-lazy-src', 'data-src', 'data-original', 'src']) {
        const attrMatch = tag.match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
        if (attrMatch && attrMatch[1].startsWith('http')) urls.push(attrMatch[1]);
      }
      const srcsetMatch = tag.match(/srcset=["']([^"']+)["']/i);
      if (srcsetMatch) {
        srcsetMatch[1].split(',').map(s => s.trim().split(/\s+/)[0]).filter(s => s.startsWith('http')).forEach(s => urls.push(s));
      }
      for (const src of urls) {
        if (EXCLUDE_PATTERNS.some(p => src.toLowerCase().includes(p))) continue;
        if (/-\d+x\d+\.\w+$/.test(src)) continue;
        images.add(src);
      }
    }
    for (const m of html.matchAll(/href=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif|bmp)(?:\?[^"']*)?)["']/gi)) {
      const src = m[1];
      if (EXCLUDE_PATTERNS.some(p => src.toLowerCase().includes(p))) continue;
      if (/-\d+x\d+\.\w+$/.test(src)) continue;
      images.add(src);
    }
    return [...images];
  }

  _downloadImage(url, filepath, referer) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const proto = urlObj.protocol === 'https:' ? https : http;
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'Referer': referer || urlObj.origin,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      };

      const req = proto.get(options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          if (loc) {
            const fullUrl = loc.startsWith('http') ? loc : new URL(loc, url).href;
            this._downloadImage(fullUrl, filepath, referer).then(resolve).catch(reject);
          } else {
            reject(new Error('Redirect without location'));
          }
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(filepath);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', (err) => { fs.unlink(filepath, () => {}); reject(err); });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  _getExtension(imgUrl) {
    try {
      const urlObj = new URL(imgUrl);
      let ext = path.extname(urlObj.pathname).split('?')[0];
      if (ext.length > 6 || !ext.match(/^\.\w+$/)) ext = '.jpg';
      return ext;
    } catch {
      return '.jpg';
    }
  }

  _duration(startTime) {
    const sec = Math.floor((Date.now() - startTime) / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return min > 0 ? `${min}m ${s}s` : `${s}s`;
  }

  abort() {
    this.aborted = true;
  }

  async _cleanup() {
    if (this._cdp) {
      try { await this._cdp.detach(); } catch {}
      this._cdp = null;
    }
    this._capturedImages.clear();
    this._imageCache.clear();
    if (this.browser) {
      try { await this.browser.close(); } catch {}
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = ImageScraper;
