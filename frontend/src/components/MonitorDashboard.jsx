import { useState, useEffect, useRef } from 'react'
import SystemMetrics from './SystemMetrics'
import JobStatistics from './JobStatistics'
import AlertConfig from './AlertConfig'

function usePolling(url, interval) {
  const [data, setData] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    let active = true
    const fetchData = () => {
      fetch(url)
        .then(r => r.json())
        .then(d => { if (active) setData(d) })
        .catch(() => {})
    }
    fetchData()
    timerRef.current = setInterval(fetchData, interval)
    return () => {
      active = false
      clearInterval(timerRef.current)
    }
  }, [url, interval])

  return data
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (sec < 60) return `${sec}초 전`
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`
  return `${Math.floor(sec / 86400)}일 전`
}

function RealtimePanel({ data }) {
  if (!data) return <div className="text-muted text-sm">로딩 중...</div>

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">실시간 현황</h3>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>CPU {data.system.cpu}%</span>
          <span>RAM {data.system.memoryMB}MB</span>
        </div>
      </div>

      {/* Running Jobs */}
      {data.running.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs text-muted">실행 중 ({data.running.length})</div>
          {data.running.map(job => (
            <div key={job.id} className="bg-[#21262d] rounded-md p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-accent font-mono truncate max-w-[200px]">{job.keyword || job.url}</span>
                <span className="text-xs text-green animate-pulse">실행 중</span>
              </div>
              <div className="text-[11px] text-muted truncate">{job.url}</div>
              {job.lastEvent && (
                <div className="text-[11px] text-muted">
                  {job.lastEvent.type === 'download' && `다운로드: ${job.lastEvent.current}/${job.lastEvent.total || '?'}`}
                  {job.lastEvent.type === 'page' && `페이지 ${job.lastEvent.page} 처리 중`}
                  {job.lastEvent.type === 'status' && job.lastEvent.message}
                  {job.lastEvent.type === 'info' && job.lastEvent.message}
                </div>
              )}
              {job.lastEvent?.total > 0 && (
                <div className="h-1.5 bg-[#161b22] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green rounded-full transition-all"
                    style={{ width: `${Math.min((job.lastEvent.current / job.lastEvent.total) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted bg-[#21262d] rounded-md p-3 text-center">
          실행 중인 작업 없음
        </div>
      )}

      {/* Queued */}
      {data.queued.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted">대기열 ({data.queued.length})</div>
          {data.queued.map(job => (
            <div key={job.id} className="bg-[#21262d] rounded-md px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-text truncate">{job.keyword || job.url}</span>
              <span className="text-xs text-yellow">대기</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent Completed */}
      {data.recentCompleted.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted">최근 완료</div>
          {data.recentCompleted.map(job => (
            <div key={job.id} className="bg-[#21262d] rounded-md px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${job.status === 'completed' ? 'bg-green' : 'bg-red'}`} />
                <span className="text-xs text-text truncate">{job.keyword || '(없음)'}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {job.status === 'completed' && <span className="text-xs text-muted">{job.images}장</span>}
                <span className="text-[11px] text-muted">{timeAgo(job.completedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ApiKeyManager() {
  const [keys, setKeys] = useState([])
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState(null)
  const [loading, setLoading] = useState(false)

  const getHeaders = () => {
    const token = localStorage.getItem('wih_token')
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
  }

  const loadKeys = () => {
    fetch('/api/auth/api-keys', { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setKeys)
      .catch(() => {})
  }

  useEffect(() => { loadKeys() }, [])

  const handleCreate = async () => {
    if (!newKeyName.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/api-keys', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setCreatedKey(data.key)
        setNewKeyName('')
        loadKeys()
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    await fetch(`/api/auth/api-keys/${id}`, { method: 'DELETE', headers: getHeaders() })
    loadKeys()
  }

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-text">API Keys</h3>
      <p className="text-[11px] text-muted">OpenClaw 등 외부 서비스에서 파일 API에 접근할 때 사용합니다.<br/>헤더: <code className="text-accent">X-API-Key: {'<key>'}</code></p>

      {/* Create new key */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="키 이름 (예: openclaw)"
          className="flex-1 px-2 py-1.5 text-xs bg-bg border border-border rounded-md text-text focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleCreate}
          disabled={loading || !newKeyName.trim()}
          className="px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent/80 disabled:opacity-50 cursor-pointer"
        >
          생성
        </button>
      </div>

      {/* Newly created key — show full, one-time */}
      {createdKey && (
        <div className="bg-green/10 border border-green/30 rounded-md p-3 space-y-2">
          <div className="text-xs text-green font-medium">새 API Key가 생성되었습니다. 이 키는 다시 표시되지 않습니다.</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] text-text bg-bg p-2 rounded border border-border break-all select-all">{createdKey}</code>
            <button
              onClick={() => handleCopy(createdKey)}
              className="px-2 py-1 text-xs text-accent hover:text-accent/80 cursor-pointer shrink-0"
            >
              복사
            </button>
          </div>
          <button onClick={() => setCreatedKey(null)} className="text-[11px] text-muted hover:text-text cursor-pointer">닫기</button>
        </div>
      )}

      {/* Key list */}
      {keys.length > 0 ? (
        <div className="space-y-1.5">
          {keys.map(k => (
            <div key={k.id} className="flex items-center justify-between bg-[#21262d] rounded-md px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-text font-medium">{k.name}</span>
                <code className="text-[11px] text-muted">{k.keyPreview}</code>
              </div>
              <button
                onClick={() => handleDelete(k.id)}
                className="text-[10px] text-muted hover:text-red cursor-pointer shrink-0"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted text-center py-2">생성된 API Key가 없습니다</div>
      )}

      {/* Usage guide */}
      <details className="text-[11px]">
        <summary className="text-muted cursor-pointer hover:text-text">OpenClaw 사용 가이드</summary>
        <div className="mt-2 space-y-2 text-muted bg-[#21262d] rounded-md p-3">
          <p>파일 목록 조회:</p>
          <code className="block text-accent text-[10px] break-all">curl -H "X-API-Key: wih_..." http://HOST:3000/api/files?path=/</code>
          <p>파일 다운로드:</p>
          <code className="block text-accent text-[10px] break-all">curl -H "X-API-Key: wih_..." -o file.jpg "http://HOST:3000/api/files/download?path=/folder/file.jpg"</code>
          <p>파일 업로드:</p>
          <code className="block text-accent text-[10px] break-all">curl -H "X-API-Key: wih_..." -F "files=@photo.jpg" "http://HOST:3000/api/files/upload?path=/"</code>
        </div>
      </details>
    </div>
  )
}

export default function MonitorDashboard() {
  const system = usePolling('/api/monitor/system', 5000)
  const stats = usePolling('/api/monitor/stats', 30000)
  const realtime = usePolling('/api/monitor/realtime', 3000)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SystemMetrics data={system} />
      <RealtimePanel data={realtime} />
      <JobStatistics data={stats} />
      <AlertConfig />
      <ApiKeyManager />
    </div>
  )
}
