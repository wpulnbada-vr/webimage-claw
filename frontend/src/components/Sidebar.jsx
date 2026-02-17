import React from 'react';

const STATUS_DOT = {
  running: 'bg-accent animate-pulse',
  queued: 'bg-yellow',
  completed: 'bg-green',
  failed: 'bg-red',
  aborted: 'bg-orange',
};

export default function Sidebar({ history, selectedJob, onSelect, onDelete }) {
  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
      <div className="p-3 border-b border-border">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">History</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {history.length === 0 && (
          <div className="p-4 text-xs text-muted text-center">No jobs yet</div>
        )}
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition hover:bg-surface-hover ${
              selectedJob === item.id ? 'bg-surface-hover border-l-2 border-l-accent' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[item.status] || 'bg-muted'}`} />
              <span className="text-sm text-text truncate">{item.keyword || 'Direct'}</span>
            </div>
            <div className="text-xs text-muted truncate mt-0.5 pl-4">
              {new URL(item.url).hostname}
            </div>
            {item.result && (
              <div className="text-xs text-green mt-0.5 pl-4">
                {item.result.total} images
              </div>
            )}
            {item.status === 'completed' && item.result?.total > 0 && item.result?.folder && (
              <div className="flex items-center gap-2 mt-1 pl-4" onClick={e => e.stopPropagation()}>
                <a
                  href={`/browse/${encodeURIComponent(item.result.folder)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-accent hover:underline"
                >
                  Browse
                </a>
                <a
                  href={`/api/zip/${encodeURIComponent(item.result.folder)}`}
                  download={`${item.result.folder}.zip`}
                  className="text-[10px] text-green hover:underline"
                >
                  ZIP
                </a>
              </div>
            )}
          </button>
        ))}
      </div>
    </aside>
  );
}
