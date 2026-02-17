import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import InputForm from './components/InputForm';
import JobPanel from './components/JobPanel';
import Sidebar from './components/Sidebar';
import ImageGrid from './components/ImageGrid';

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [images, setImages] = useState([]);
  const [sseConnections, setSseConnections] = useState({});
  const sseRef = useRef({});

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      setJobs(await res.json());
    } catch {}
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history');
      setHistory(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchHistory();
    const interval = setInterval(() => {
      fetchJobs();
      fetchHistory();
    }, 5000);

    const refresh = () => { fetchJobs(); fetchHistory(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onFocus = () => refresh();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchJobs, fetchHistory]);

  const startScrape = async (url, keyword) => {
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, keyword }),
      });
      const data = await res.json();
      if (data.error === 'duplicate') {
        setSelectedJob(data.existingJobId);
        return;
      }
      if (data.jobId) {
        setSelectedJob(data.jobId);
        connectSSE(data.jobId);
        fetchJobs();
      }
    } catch (err) {
      console.error('Scrape error:', err);
    }
  };

  const connectSSE = useCallback((jobId) => {
    if (sseRef.current[jobId]) return;

    const es = new EventSource(`/api/progress/${jobId}`);
    sseRef.current[jobId] = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        setJobs(prev => prev.map(j => {
          if (j.id !== jobId) return j;
          const updated = { ...j, lastEvent: event };
          if (event.type === 'complete') {
            updated.status = 'completed';
            updated.result = { total: event.total, folder: event.folder, duration: event.duration };
          } else if (event.type === 'error') {
            updated.status = 'failed';
            updated.error = event.message;
          }
          return updated;
        }));

        if (event.type === 'complete' || event.type === 'error') {
          es.close();
          delete sseRef.current[jobId];
          fetchJobs();
          fetchHistory();
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      delete sseRef.current[jobId];
    };
  }, [fetchJobs, fetchHistory]);

  useEffect(() => {
    // Auto-connect SSE for running jobs
    jobs.forEach(j => {
      if ((j.status === 'running' || j.status === 'queued') && !sseRef.current[j.id]) {
        connectSSE(j.id);
      }
    });
  }, [jobs, connectSSE]);

  const abortJob = async (jobId) => {
    await fetch(`/api/abort/${jobId}`, { method: 'POST' });
    fetchJobs();
    fetchHistory();
  };

  const deleteJob = async (jobId) => {
    await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
    if (selectedJob === jobId) setSelectedJob(null);
    fetchJobs();
    fetchHistory();
  };

  const loadImages = async (folder) => {
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(folder)}`);
      setImages(await res.json());
    } catch {
      setImages([]);
    }
  };

  useEffect(() => {
    if (!selectedJob) { setImages([]); return; }
    const job = [...jobs, ...history].find(j => j.id === selectedJob);
    if (job?.result?.folder) {
      loadImages(job.result.folder);
    } else if (job?.keyword) {
      loadImages(job.keyword.replace(/\s+/g, '_').toLowerCase());
    }
  }, [selectedJob, jobs, history]);

  const allItems = [...history];
  const activeJob = allItems.find(j => j.id === selectedJob) || jobs.find(j => j.id === selectedJob);

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          history={allItems}
          selectedJob={selectedJob}
          onSelect={setSelectedJob}
          onDelete={deleteJob}
        />
        <main className="flex-1 flex flex-col overflow-hidden">
          <InputForm onSubmit={startScrape} />
          {activeJob && (
            <JobPanel
              job={activeJob}
              liveJob={jobs.find(j => j.id === selectedJob)}
              onAbort={abortJob}
              onDelete={deleteJob}
            />
          )}
          <ImageGrid
            images={images}
            folder={activeJob?.result?.folder || activeJob?.keyword?.replace(/\s+/g, '_').toLowerCase()}
          />
        </main>
      </div>
    </div>
  );
}
