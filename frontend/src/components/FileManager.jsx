import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthGate'
import LoginScreen from './LoginScreen'
import FileToolbar from './fm/FileToolbar'
import FileList from './fm/FileList'

export default function FileManager() {
  const auth = useAuth()
  const [currentPath, setCurrentPath] = useState('/')
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const headers = useCallback(() => ({
    ...auth?.getAuthHeaders(),
    'Content-Type': 'application/json',
  }), [auth])

  const authHeaders = useCallback(() => auth?.getAuthHeaders() || {}, [auth])

  const loadDir = useCallback(async (dirPath) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/filemanager?path=${encodeURIComponent(dirPath)}`, { headers: authHeaders() })
      if (res.status === 401) return // will show login
      const data = await res.json()
      setItems(data.items || [])
      setCurrentPath(data.path || '/')
      setSelected(new Set())
    } catch {} finally {
      setLoading(false)
    }
  }, [authHeaders])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/filemanager/stats', { headers: authHeaders() })
      if (res.ok) setStats(await res.json())
    } catch {}
  }, [authHeaders])

  useEffect(() => {
    if (auth?.authenticated) {
      loadDir(currentPath)
      loadStats()
    }
  }, [auth?.authenticated])

  // If not authenticated, show login
  if (!auth?.authenticated) {
    return <LoginScreen onLogin={() => window.location.reload()} />
  }

  const navigate = (path) => {
    loadDir(path)
  }

  const handleSelect = (idx) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const handleSelectAll = (selectAll) => {
    if (selectAll) {
      setSelected(new Set(items.map((_, i) => i)))
    } else {
      setSelected(new Set())
    }
  }

  const handleUpload = async (files) => {
    const formData = new FormData()
    for (const f of files) formData.append('files', f)
    await fetch(`/api/filemanager/upload?path=${encodeURIComponent(currentPath)}`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    })
    loadDir(currentPath)
    loadStats()
  }

  const handleMkdir = async (name) => {
    const dirPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
    await fetch('/api/filemanager/mkdir', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ path: dirPath }),
    })
    loadDir(currentPath)
  }

  const handleDelete = async () => {
    const selectedItems = [...selected].map(i => items[i])
    for (const item of selectedItems) {
      const itemPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
      await fetch(`/api/filemanager?path=${encodeURIComponent(itemPath)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
    }
    setShowDeleteModal(false)
    loadDir(currentPath)
    loadStats()
  }

  const handleDownloadZip = async () => {
    const paths = [...selected].map(i => {
      const item = items[i]
      return currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
    })
    const res = await fetch('/api/filemanager/download-zip', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ paths }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'download.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  // Breadcrumb
  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean)

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      {stats && (
        <div className="flex items-center gap-4 text-xs text-muted">
          <span>{stats.folders}개 폴더</span>
          <span>{stats.files}개 파일</span>
          <span>{stats.totalSize}</span>
        </div>
      )}

      {/* Toolbar */}
      <FileToolbar
        currentPath={currentPath}
        selectedCount={selected.size}
        onUpload={handleUpload}
        onMkdir={handleMkdir}
        onDelete={() => setShowDeleteModal(true)}
        onDownloadZip={handleDownloadZip}
        onRefresh={() => { loadDir(currentPath); loadStats() }}
      />

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-muted flex-wrap">
        <button onClick={() => navigate('/')} className="hover:text-accent cursor-pointer">downloads</button>
        {pathParts.map((part, i) => {
          const partPath = '/' + pathParts.slice(0, i + 1).join('/')
          return (
            <span key={partPath} className="flex items-center gap-1">
              <span>/</span>
              <button onClick={() => navigate(partPath)} className="hover:text-accent cursor-pointer">{part}</button>
            </span>
          )
        })}
      </div>

      {/* File List */}
      {loading ? (
        <div className="text-sm text-muted text-center py-8">로딩 중...</div>
      ) : (
        <FileList
          items={items}
          currentPath={currentPath}
          selected={selected}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          onNavigate={navigate}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-surface border border-border rounded-lg p-5 max-w-sm mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-text">파일 삭제</h3>
            <p className="text-xs text-muted">{selected.size}개 항목을 삭제하시겠습니까?<br/>이 작업은 되돌릴 수 없습니다.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-3 py-1.5 text-xs text-muted hover:text-text bg-[#21262d] rounded-md cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs text-white bg-red rounded-md hover:bg-red/80 cursor-pointer"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
