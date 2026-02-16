import React, { useState, useEffect, useRef } from 'react';

const STATUS_COLORS = {
  running: 'text-accent',
  queued: 'text-yellow',
  completed: 'text-green',
  failed: 'text-red',
  aborted: 'text-orange',
};

const STATUS_LABELS = {
  running: 'Running',
  queued: 'Queued',
  completed: 'Completed',
  failed: 'Failed',
  aborted: 'Aborted',
};

export default function JobPanel({ job, liveJob, onAbort, onDelete }) {
  const [events, setEvents] = useState([]);
  const logRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    setEvents([]);
    if (!job) return;
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    const es = new EventSource(`/api/progress/${job.id}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        setEvents(prev => [...prev, event]);
      } catch {}
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
    };

    return () => { es.close(); esRef.current = null; };
  }, [job?.id]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  if (!job) return null;

  const status = liveJob?.status || job.status;
  const isActive = status === 'running' || status === 'queued';
  const lastEvent = events[events.length - 1] || liveJob?.lastEvent;

  let progressPct = 0;
  if (lastEvent?.type === 'download' && lastEvent.total > 0) {
    progressPct = Math.round((lastEvent.current / lastEvent.total) * 100);
  } else if (status === 'completed') {
    progressPct = 100;
  }

  return (
    <div className="bg-surface border-b border-border p-4 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${STATUS_COLORS[status]}`}>
            {isActive && <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse mr-1.5" />}
            {STATUS_LABELS[status] || status}
          </span>
          <span className="text-xs text-muted truncate max-w-md">{job.keyword || job.url}</span>
        </div>
        <div className="flex gap-2">
          {isActive && (
            <button
              onClick={() => onAbort(job.id)}
              className="text-xs text-red hover:text-red/80 px-2 py-1 border border-red/30 rounded transition"
            >
              Abort
            </button>
          )}
          <button
            onClick={() => onDelete(job.id)}
            className="text-xs text-muted hover:text-red px-2 py-1 border border-border rounded transition"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-bg rounded overflow-hidden mb-2">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Log */}
      <div ref={logRef} className="max-h-32 overflow-y-auto text-xs text-muted font-mono space-y-0.5">
        {events.map((evt, i) => (
          <div key={i}>
            {evt.type === 'status' && <span>{evt.message}</span>}
            {evt.type === 'cf' && <span className="text-yellow">{evt.message}</span>}
            {evt.type === 'search' && <span className="text-accent">{evt.pages} pages, {evt.posts} posts found</span>}
            {evt.type === 'post' && <span>Post {evt.current}/{evt.total}: {evt.title?.substring(0, 60)}</span>}
            {evt.type === 'found' && <span className="text-green">{evt.message}</span>}
            {evt.type === 'download' && <span>Download: {evt.current}/{evt.total}</span>}
            {evt.type === 'complete' && <span className="text-green">Complete! {evt.total} images ({evt.duration})</span>}
            {evt.type === 'error' && <span className="text-red">Error: {evt.message}</span>}
          </div>
        ))}
      </div>

      {job.result && (
        <div className="mt-2 text-xs text-green">
          {job.result.total} images downloaded ({job.result.duration})
        </div>
      )}
    </div>
  );
}
