import { useState, useEffect } from 'react'

const STATUS_COLORS = {
  running: 'text-yellow',
  completed: 'text-green',
  failed: 'text-red',
  queued: 'text-muted',
  aborted: 'text-red',
}

const STATUS_LABELS = {
  running: 'Running',
  queued: 'Queued',
  failed: 'Failed',
  aborted: 'Aborted',
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

export default function Sidebar({ refreshKey, onDeleteHistory }) {
  const [history, setHistory] = useState([])
  const [showClearModal, setShowClearModal] = useState(false)

  const handleClearAll = async () => {
    await fetch('/api/history', { method: 'DELETE' })
    setHistory([])
    setShowClearModal(false)
  }

  useEffect(() => {
    const load = () => {
      fetch('/api/history')
        .then(r => r.json())
        .then(setHistory)
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 5000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    const onFocus = () => load()

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshKey])

  const handleDelete = async (id) => {
    await fetch(`/api/jobs/${id}`, { method: 'DELETE' })
    setHistory(prev => prev.filter(h => h.id !== id))
    onDeleteHistory?.(id)
  }

  return (
    <aside className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted">History</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">{history.length} jobs</span>
          {history.length > 0 && (
            <button
              onClick={() => setShowClearModal(true)}
              className="text-[10px] text-red/60 hover:text-red transition-colors cursor-pointer"
              title="전체 삭제"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Clear All Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowClearModal(false)}>
          <div className="bg-surface border border-border rounded-lg p-5 max-w-sm mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-text">전체 기록 삭제</h3>
            <p className="text-xs text-muted">모든 작업 기록을 삭제하시겠습니까?<br/>(다운로드된 파일은 유지됩니다)</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-3 py-1.5 text-xs text-muted hover:text-text bg-[#21262d] rounded-md cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 text-xs text-white bg-red rounded-md hover:bg-red/80 cursor-pointer"
              >
                전체 삭제
              </button>
            </div>
          </div>
        </div>
      )}
      {history.length === 0 ? (
        <p className="text-sm text-muted">No history yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
          {history.map(job => {
            let hostname = ''
            try { hostname = new URL(job.url).hostname } catch { hostname = job.url }

            const isActive = job.status === 'running' || job.status === 'queued'
            const isCompleted = job.status === 'completed'
            const fileCount = job.result?.total || 0
            const dateStr = formatDate(job.completedAt || job.createdAt)

            return (
              <div
                key={job.id}
                className={`group bg-bg border rounded-md p-2.5 transition-colors ${
                  isActive ? 'border-yellow/40' : 'border-border hover:border-accent/50'
                }`}
              >
                {/* Row 1: keyword + status */}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs truncate max-w-[150px]">
                    {job.keyword || '(direct)'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isActive && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow"></span>
                      </span>
                    )}
                    <span className={`text-[10px] ${STATUS_COLORS[job.status] || 'text-muted'}`}>
                      {isCompleted ? `${fileCount} files` : STATUS_LABELS[job.status] || job.status}
                    </span>
                  </div>
                </div>

                {/* Row 2: site URL */}
                <div className="text-[11px] text-muted truncate mt-0.5">{hostname}</div>

                {/* Row 3: date + delete */}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted/60">{dateStr}</span>
                  <button
                    onClick={() => handleDelete(job.id)}
                    className="text-[10px] text-muted/40 hover:text-red opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    delete
                  </button>
                </div>

                {/* Download links for completed */}
                {isCompleted && fileCount > 0 && job.result?.folder && (
                  <div className="flex items-center gap-2 mt-1">
                    <a
                      href={`/browse/${encodeURIComponent(job.result.folder)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-accent hover:underline"
                    >
                      폴더
                    </a>
                    <a
                      href={`/api/zip/${encodeURIComponent(job.result.folder)}`}
                      className="text-[10px] text-green hover:underline"
                      onClick={(e) => {
                        e.preventDefault()
                        const a = document.createElement('a')
                        a.href = `/api/zip/${encodeURIComponent(job.result.folder)}`
                        a.download = `${job.result.folder}.zip`
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                      }}
                    >
                      ZIP
                    </a>
                    {job.result?.duration && (
                      <span className="text-[10px] text-muted/50">{job.result.duration}</span>
                    )}
                  </div>
                )}

                {/* Duration only (no files) */}
                {isCompleted && (fileCount === 0 || !job.result?.folder) && job.result?.duration && (
                  <div className="text-[10px] text-muted/50 mt-0.5">{job.result.duration}</div>
                )}

                {/* Error message */}
                {job.status === 'failed' && job.error && (
                  <div className="text-[10px] text-red/70 mt-0.5 truncate">{job.error}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}
