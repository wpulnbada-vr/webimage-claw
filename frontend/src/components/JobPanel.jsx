import { useState, useEffect, useRef } from 'react'
import ImageGrid from './ImageGrid'

const LOG_COLORS = {
  status: 'text-accent',
  cf: 'text-yellow',
  search: 'text-green',
  post: 'text-muted',
  found: 'text-green',
  download: 'text-text',
  complete: 'text-green font-semibold',
  error: 'text-red',
}

export default function JobPanel({ jobId, url, keyword, onDone, onDelete }) {
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('시작 중...')
  const [stats, setStats] = useState('')
  const [done, setDone] = useState(false)
  const [folder, setFolder] = useState(null)
  const logRef = useRef(null)

  useEffect(() => {
    const es = new EventSource(`/api/progress/${jobId}`)

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data)
      handleEvent(ev)
    }

    es.onerror = () => {
      es.close()
    }

    return () => es.close()
  }, [jobId])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  const handleEvent = (ev) => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false })

    switch (ev.type) {
      case 'status':
        addLog(ev.type, time, ev.message)
        setLabel(ev.message)
        break
      case 'cf':
        updateLog(ev.type, time, ev.message)
        setLabel(ev.message)
        break
      case 'search':
        addLog(ev.type, time, `검색 완료: ${ev.pages}페이지, ${ev.posts}개 포스트`)
        break
      case 'post':
        updateLog(ev.type, time, `[${ev.current}/${ev.total}] ${ev.title}`)
        setLabel(`포스트 ${ev.current}/${ev.total}`)
        setProgress((ev.current / ev.total) * 30)
        break
      case 'found':
        addLog(ev.type, time, ev.message)
        break
      case 'download':
        updateLog(ev.type, time, `다운로드 ${ev.current}/${ev.total}`)
        setLabel(`다운로드 ${ev.current}/${ev.total}`)
        setStats(`${ev.current} / ${ev.total}`)
        if (ev.total > 0) setProgress(30 + (ev.current / ev.total) * 70)
        break
      case 'complete':
        addLog(ev.type, time, `완료! ${ev.total}개 이미지 (${ev.duration})`)
        setLabel('완료!')
        setProgress(100)
        setStats(`${ev.total} images in ${ev.duration}`)
        setFolder(ev.folder)
        setDone(true)
        onDone?.()
        break
      case 'error':
        addLog(ev.type, time, ev.message)
        break
    }
  }

  const addLog = (type, time, msg) => {
    setLogs(prev => [...prev, { type, time, msg, id: Date.now() + Math.random() }])
  }

  const updateLog = (type, time, msg) => {
    setLogs(prev => {
      if (prev.length > 0 && prev[prev.length - 1].type === type) {
        const next = [...prev]
        next[next.length - 1] = { type, time, msg, id: next[next.length - 1].id }
        return next
      }
      return [...prev, { type, time, msg, id: Date.now() + Math.random() }]
    })
  }

  const handleAbort = async () => {
    await fetch(`/api/abort/${jobId}`, { method: 'POST' })
    addLog('error', new Date().toLocaleTimeString('ko-KR', { hour12: false }), '작업 중지됨')
    setDone(true)
  }

  const handleDelete = async () => {
    await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
    onDelete?.(jobId)
  }

  let hostname = ''
  try { hostname = new URL(url).hostname } catch { hostname = url }

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{keyword || '(direct)'}</span>
          <span className="text-xs text-muted">{hostname}</span>
          {!done && <span className="text-xs text-yellow animate-pulse">{label}</span>}
          {done && <span className="text-xs text-green">{label}</span>}
        </div>
        <div className="flex gap-1.5">
          {!done && (
            <button onClick={handleAbort}
              className="text-xs bg-red text-white px-3 py-1 rounded cursor-pointer hover:opacity-80">
              중지
            </button>
          )}
          <button onClick={handleDelete}
            className="text-xs bg-surface border border-border text-muted px-3 py-1 rounded cursor-pointer hover:border-red hover:text-red transition-colors">
            삭제
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-bg">
        <div
          className="h-full bg-gradient-to-r from-accent-dim to-accent transition-all duration-300"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-4 py-1 text-xs text-muted">{stats}</div>
      )}

      {/* Log console */}
      <div ref={logRef} className="h-36 overflow-y-auto px-4 py-2 font-mono text-xs leading-relaxed">
        {logs.map(log => (
          <div key={log.id} className={LOG_COLORS[log.type] || 'text-text'}>
            [{log.time}] {log.msg}
          </div>
        ))}
      </div>

      {/* Image grid */}
      {folder && <ImageGrid folder={folder} />}
    </div>
  )
}
