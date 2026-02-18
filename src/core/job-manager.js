const { EventEmitter } = require('events');
const fs = require('fs');
const ImageScraper = require('./scraper');

class JobManager extends EventEmitter {
  constructor({ maxConcurrent = 2, historyFile, downloadsDir, chromePath } = {}) {
    super();
    this.maxConcurrent = maxConcurrent;
    this.historyFile = historyFile;
    this.downloadsDir = downloadsDir;
    this.chromePath = chromePath;
    this.jobs = new Map();
    this.queue = [];
    this._subscribers = new Map(); // jobId -> Set<callback>
  }

  // --- History persistence ---

  _loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        return JSON.parse(fs.readFileSync(this.historyFile, 'utf-8'));
      }
    } catch {}
    return [];
  }

  _saveHistory(history) {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));
    } catch {}
  }

  _addToHistory(job) {
    let history = this._loadHistory();
    const idx = history.findIndex(h => h.id === job.id);
    const entry = {
      id: job.id,
      url: job.url,
      keyword: job.keyword,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      result: job.result,
      error: job.error,
    };
    if (idx !== -1) {
      history[idx] = entry;
    } else {
      history.unshift(entry);
    }
    // Remove zero-file duplicates: if this job completed with results,
    // delete older entries with the same url+keyword that have 0 files
    if (job.status === 'completed' && job.result?.total > 0) {
      history = history.filter(h =>
        h.id === job.id ||
        h.url !== job.url ||
        h.keyword !== job.keyword ||
        (h.result?.total || 0) > 0
      );
    }
    if (history.length > 200) history.length = 200;
    this._saveHistory(history);
  }

  _updateHistoryItem(jobId, updates) {
    const history = this._loadHistory();
    const idx = history.findIndex(h => h.id === jobId);
    if (idx !== -1) {
      Object.assign(history[idx], updates);
      this._saveHistory(history);
    }
  }

  // --- Queue management ---

  _getRunningCount() {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'running') count++;
    }
    return count;
  }

  _processQueue() {
    while (this.queue.length > 0 && this._getRunningCount() < this.maxConcurrent) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);
      if (job && job.status === 'queued') {
        this._runJob(job);
      }
    }
  }

  _notifySubscribers(jobId, event) {
    const subs = this._subscribers.get(jobId);
    if (subs) {
      for (const cb of subs) {
        try { cb(event); } catch {}
      }
    }
  }

  _closeSubscribers(jobId) {
    const subs = this._subscribers.get(jobId);
    if (subs) {
      for (const cb of subs) {
        try { cb({ type: 'close' }); } catch {}
      }
      subs.clear();
    }
  }

  _runJob(job) {
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    this._updateHistoryItem(job.id, { status: 'running', startedAt: job.startedAt });
    this.emit('job:progress', job.id, { type: 'status', message: 'Job started' });

    const scraper = new ImageScraper();
    job.scraper = scraper;

    scraper.on('progress', (event) => {
      job.lastEvent = event;
      job.events.push(event);
      this._notifySubscribers(job.id, event);
      this.emit('job:progress', job.id, event);

      if (event.type === 'complete') {
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        job.result = { total: event.total, folder: event.folder, duration: event.duration };
        this._addToHistory(job);
        this._closeSubscribers(job.id);
        this.emit('job:completed', job.id, job.result);
        this._processQueue();
      } else if (event.type === 'error' && !job.events.some(e => e.type === 'complete')) {
        if (job.status !== 'completed') {
          job.status = 'failed';
          job.completedAt = new Date().toISOString();
          job.error = event.message;
          this._addToHistory(job);
          this._closeSubscribers(job.id);
          this.emit('job:failed', job.id, event.message);
          this._processQueue();
        }
      }
    });

    scraper.scrape(job.url, job.keyword, {
      downloadDir: this.downloadsDir,
      chromePath: this.chromePath,
    }).catch((err) => {
      job.status = 'failed';
      job.error = err.message;
      this._closeSubscribers(job.id);
      this.emit('job:failed', job.id, err.message);
      this._processQueue();
    });
  }

  // --- Public API ---

  createJob(url, keyword) {
    // Duplicate check
    for (const existing of this.jobs.values()) {
      if (existing.url === url && existing.keyword === (keyword || '') &&
          (existing.status === 'running' || existing.status === 'queued')) {
        return { error: 'duplicate', existingJobId: existing.id };
      }
    }

    const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const job = {
      id: jobId,
      url,
      keyword: keyword || '',
      status: 'queued',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      events: [],
      lastEvent: null,
      scraper: null,
      result: null,
      error: null,
    };

    this.jobs.set(jobId, job);
    this._addToHistory(job);
    this.emit('job:created', jobId);

    if (this._getRunningCount() < this.maxConcurrent) {
      this._runJob(job);
    } else {
      this.queue.push(jobId);
    }

    return { jobId, status: job.status };
  }

  abortJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return { error: 'not_found' };
    if (job.scraper) job.scraper.abort();
    job.status = 'aborted';
    job.completedAt = new Date().toISOString();
    this._addToHistory(job);
    this._closeSubscribers(jobId);
    return { status: 'aborted' };
  }

  deleteJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return { error: 'not_found' };
    if (job.scraper) job.scraper.abort();
    this._closeSubscribers(jobId);
    const qIdx = this.queue.indexOf(jobId);
    if (qIdx !== -1) this.queue.splice(qIdx, 1);
    this.jobs.delete(jobId);
    const history = this._loadHistory();
    const filtered = history.filter(h => h.id !== jobId);
    if (filtered.length !== history.length) this._saveHistory(filtered);
    this._processQueue();
    return { status: 'deleted' };
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return {
      id: job.id,
      url: job.url,
      keyword: job.keyword,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      result: job.result,
      error: job.error,
      lastEvent: job.lastEvent,
    };
  }

  getJobs() {
    const list = [];
    for (const job of this.jobs.values()) {
      list.push({
        id: job.id,
        url: job.url,
        keyword: job.keyword,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        result: job.result,
        error: job.error,
      });
    }
    return list.reverse();
  }

  getHistory() {
    const history = this._loadHistory();
    return history.map(h => {
      const memJob = this.jobs.get(h.id);
      if (memJob) {
        return {
          id: memJob.id,
          url: memJob.url,
          keyword: memJob.keyword,
          status: memJob.status,
          createdAt: memJob.createdAt,
          completedAt: memJob.completedAt,
          result: memJob.result,
          error: memJob.error,
        };
      }
      return h;
    });
  }

  getJobSummary(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      // Check history
      const history = this._loadHistory();
      const h = history.find(h => h.id === jobId);
      if (!h) return null;
      const statusMap = { completed: 'Completed', failed: 'Failed', aborted: 'Aborted', queued: 'Queued', running: 'Running' };
      let text = `Status: ${statusMap[h.status] || h.status}\n`;
      text += `Keyword: ${h.keyword || 'none'}\n`;
      if (h.result) {
        text += `Result: ${h.result.total} images (${h.result.duration})\n`;
      }
      if (h.error) text += `Error: ${h.error}\n`;
      return text;
    }

    const statusMap = { completed: 'Completed', failed: 'Failed', aborted: 'Aborted', queued: 'Queued', running: 'Downloading' };
    let text = `Status: ${statusMap[job.status] || job.status}\n`;
    text += `Keyword: ${job.keyword || 'none'}\n`;

    if (job.lastEvent) {
      const e = job.lastEvent;
      if (e.type === 'download' && e.total > 0) {
        const pct = Math.round((e.current / e.total) * 100);
        text += `Progress: ${e.current}/${e.total} images (${pct}%)\n`;
      } else if (e.type === 'search') {
        text += `Search: ${e.pages} pages, ${e.posts} posts\n`;
      } else if (e.type === 'post') {
        text += `Post: ${e.current}/${e.total}\n`;
      } else if (e.type === 'complete') {
        text += `Result: ${e.total} images (${e.duration})\n`;
      }
    }

    if (job.startedAt) {
      const elapsed = Math.floor((Date.now() - new Date(job.startedAt).getTime()) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      text += `Elapsed: ${min > 0 ? min + 'm ' : ''}${sec}s\n`;
    }

    if (job.result) {
      text += `Result: ${job.result.total} images (${job.result.duration})\n`;
    }
    if (job.error) text += `Error: ${job.error}\n`;

    return text;
  }

  subscribeToJob(jobId, cb) {
    if (!this._subscribers.has(jobId)) {
      this._subscribers.set(jobId, new Set());
    }
    this._subscribers.get(jobId).add(cb);
    return () => {
      const subs = this._subscribers.get(jobId);
      if (subs) subs.delete(cb);
    };
  }

  recoverOrphanedJobs() {
    const history = this._loadHistory();
    const orphaned = history.filter(h => h.status === 'running' || h.status === 'queued');
    if (orphaned.length === 0) return;

    console.log(`[WebClaw] Recovering ${orphaned.length} interrupted job(s)...`);
    for (const h of orphaned) {
      const job = {
        id: h.id,
        url: h.url,
        keyword: h.keyword || '',
        status: 'queued',
        createdAt: h.createdAt,
        startedAt: null,
        completedAt: null,
        events: [],
        lastEvent: null,
        scraper: null,
        result: null,
        error: null,
      };
      this.jobs.set(h.id, job);
      this._updateHistoryItem(h.id, { status: 'queued' });

      if (this._getRunningCount() < this.maxConcurrent) {
        this._runJob(job);
      } else {
        this.queue.push(h.id);
      }
      console.log(`[WebClaw]   → Re-queued: "${h.keyword}" (${h.url})`);
    }
  }
}

module.exports = JobManager;
