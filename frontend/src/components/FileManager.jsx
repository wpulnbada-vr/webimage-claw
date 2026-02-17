import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from './AuthGate'
import LoginScreen from './LoginScreen'
import FileToolbar from './fm/FileToolbar'
import FileList from './fm/FileList'
import FileGrid from './fm/FileGrid'
import ImagePreview from './fm/ImagePreview'
import UploadDropZone from './fm/UploadDropZone'
import ContextMenu from './fm/ContextMenu'
import ShareModal from './fm/ShareModal'

const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv)$/i
const AUDIO_EXT = /\.(mp3|wav|ogg|flac|aac|m4a)$/i
const TEXT_EXT = /\.(txt|json|md|log|csv|js|py|ts|jsx|tsx|html|css|xml|yml|yaml|sh|conf|ini|toml|env|sql)$/i

export default function FileManager() {
  const auth = useAuth()
  const [currentPath, setCurrentPath] = useState('/')
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(null)

  // Phase 1: view mode, sort, search
  const [viewMode, setViewMode] = useState('list')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)

  // Phase 2: clipboard, context menu, share
  const [clipboard, setClipboard] = useState(null) // { mode: 'copy'|'cut', items: [{path, name}] }
  const [contextMenu, setContextMenu] = useState(null) // { x, y, idx }
  const [shareModal, setShareModal] = useState(null) // { path }
  const containerRef = useRef(null)

  const token = localStorage.getItem('wih_token')

  const headers = useCallback(() => ({
    ...auth?.getAuthHeaders(),
    'Content-Type': 'application/json',
  }), [auth])

  const authHeaders = useCallback(() => auth?.getAuthHeaders() || {}, [auth])

  const loadDir = useCallback(async (dirPath, sb, so) => {
    setLoading(true)
    const useSortBy = sb || sortBy
    const useSortOrder = so || sortOrder
    try {
      const res = await fetch(`/api/filemanager?path=${encodeURIComponent(dirPath)}&sortBy=${useSortBy}&order=${useSortOrder}`, { headers: authHeaders() })
      if (res.status === 401) return
      const data = await res.json()
      setItems(data.items || [])
      setCurrentPath(data.path || '/')
      setSelected(new Set())
      setSearchResults(null)
    } catch {} finally {
      setLoading(false)
    }
  }, [authHeaders, sortBy, sortOrder])

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

  if (!auth?.authenticated) {
    return <LoginScreen onLogin={() => window.location.reload()} />
  }

  const navigate = (path) => {
    setSearchQuery('')
    setSearchResults(null)
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
    const displayItems = searchResults || items
    if (selectAll) {
      setSelected(new Set(displayItems.map((_, i) => i)))
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
    const displayItems = searchResults || items
    const selectedItems = [...selected].map(i => displayItems[i])
    for (const item of selectedItems) {
      const itemPath = item.path || (currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`)
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
    const displayItems = searchResults || items
    const paths = [...selected].map(i => {
      const item = displayItems[i]
      return item.path || (currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`)
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

  const handleRename = async (oldPath, newName) => {
    const res = await fetch('/api/filemanager/rename', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ oldPath, newName }),
    })
    if (res.ok) loadDir(currentPath)
  }

  // Search
  const handleSearch = async (query) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults(null)
      return
    }
    try {
      const res = await fetch(`/api/filemanager/search?q=${encodeURIComponent(query)}&path=${encodeURIComponent(currentPath)}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.results || [])
        setSelected(new Set())
      }
    } catch {}
  }

  // Sort
  const handleSortChange = (by, order) => {
    setSortBy(by)
    setSortOrder(order)
    loadDir(currentPath, by, order)
  }

  // Copy/Move (Phase 2)
  const handleCopy = () => {
    const displayItems = searchResults || items
    const selectedPaths = [...selected].map(i => {
      const item = displayItems[i]
      return { path: item.path || (currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`), name: item.name }
    })
    setClipboard({ mode: 'copy', items: selectedPaths })
  }

  const handleCut = () => {
    const displayItems = searchResults || items
    const selectedPaths = [...selected].map(i => {
      const item = displayItems[i]
      return { path: item.path || (currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`), name: item.name }
    })
    setClipboard({ mode: 'cut', items: selectedPaths })
  }

  const handlePaste = async () => {
    if (!clipboard) return
    const endpoint = clipboard.mode === 'cut' ? '/api/filemanager/move' : '/api/filemanager/copy'
    for (const item of clipboard.items) {
      const destPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
      await fetch(endpoint, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ sourcePath: item.path, destPath }),
      })
    }
    if (clipboard.mode === 'cut') setClipboard(null)
    loadDir(currentPath)
    loadStats()
  }

  // Context Menu
  const handleContextMenu = (e, idx) => {
    e.preventDefault()
    if (!selected.has(idx)) {
      setSelected(new Set([idx]))
    }
    const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 }
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, idx })
  }

  const closeContextMenu = () => setContextMenu(null)

  // Share
  const handleShare = (itemPath) => {
    setShareModal({ path: itemPath })
    closeContextMenu()
  }

  // Download single file
  const handleDownloadSingle = (itemPath) => {
    const a = document.createElement('a')
    a.href = `/api/filemanager/download?path=${encodeURIComponent(itemPath)}&token=${encodeURIComponent(token || '')}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    closeContextMenu()
  }

  // Preview items (images + video + audio + text)
  const displayItems = searchResults || items
  const previewableItems = useMemo(() =>
    displayItems
      .map((item, idx) => ({ ...item, _idx: idx }))
      .filter(item => item.type === 'file' && (IMAGE_EXT.test(item.name) || VIDEO_EXT.test(item.name) || AUDIO_EXT.test(item.name) || TEXT_EXT.test(item.name))),
    [displayItems]
  )

  const handlePreview = (fileIdx) => {
    const pvIdx = previewableItems.findIndex(img => img._idx === fileIdx)
    if (pvIdx !== -1) setPreviewIndex(pvIdx)
  }

  // Keyboard shortcuts (Phase 2)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore when in input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return

      if (e.key === 'Escape') {
        setSelected(new Set())
        closeContextMenu()
        setShareModal(null)
        return
      }
      if (e.key === 'Delete') {
        if (selected.size > 0) setShowDeleteModal(true)
        return
      }
      if (e.key === 'F2') {
        return
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'a') {
          e.preventDefault()
          handleSelectAll(true)
        } else if (e.key === 'c') {
          if (selected.size > 0) { e.preventDefault(); handleCopy() }
        } else if (e.key === 'x') {
          if (selected.size > 0) { e.preventDefault(); handleCut() }
        } else if (e.key === 'v') {
          if (clipboard) { e.preventDefault(); handlePaste() }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected, clipboard, displayItems, currentPath])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => closeContextMenu()
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean)

  return (
    <div className="space-y-4" ref={containerRef}>
      {/* Stats Bar */}
      {stats && (
        <div className="flex items-center gap-4 text-xs text-muted">
          <span>{stats.folders}개 폴더</span>
          <span>{stats.files}개 파일</span>
          <span>{stats.totalSize}</span>
          {clipboard && (
            <span className="text-accent">
              {clipboard.mode === 'copy' ? '복사됨' : '잘라내기'}: {clipboard.items.length}개
            </span>
          )}
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
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
        {searchResults && (
          <span className="ml-2 text-accent">
            검색: "{searchQuery}" ({searchResults.length}건)
          </span>
        )}
      </div>

      {/* File View */}
      <UploadDropZone onUpload={handleUpload}>
        {loading ? (
          <div className="text-sm text-muted text-center py-8">로딩 중...</div>
        ) : searchResults ? (
          /* Search results always in list view */
          <FileList
            items={searchResults}
            currentPath={currentPath}
            selected={selected}
            onSelect={handleSelect}
            onSelectAll={handleSelectAll}
            onNavigate={navigate}
            authToken={token}
            onRename={handleRename}
            onPreview={handlePreview}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            onContextMenu={handleContextMenu}
          />
        ) : viewMode === 'grid' ? (
          <FileGrid
            items={items}
            currentPath={currentPath}
            selected={selected}
            onSelect={handleSelect}
            onSelectAll={handleSelectAll}
            onNavigate={navigate}
            authToken={token}
            onRename={handleRename}
            onPreview={handlePreview}
            onContextMenu={handleContextMenu}
          />
        ) : (
          <FileList
            items={items}
            currentPath={currentPath}
            selected={selected}
            onSelect={handleSelect}
            onSelectAll={handleSelectAll}
            onNavigate={navigate}
            authToken={token}
            onRename={handleRename}
            onPreview={handlePreview}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            onContextMenu={handleContextMenu}
          />
        )}
      </UploadDropZone>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selected.size}
          item={displayItems[contextMenu.idx]}
          currentPath={currentPath}
          hasClipboard={!!clipboard}
          onClose={closeContextMenu}
          onOpen={() => {
            const item = displayItems[contextMenu.idx]
            const itemPath = item.path || (currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`)
            if (item.type === 'directory') navigate(itemPath)
            else handlePreview(contextMenu.idx)
            closeContextMenu()
          }}
          onRename={() => {
            closeContextMenu()
          }}
          onCopy={() => { handleCopy(); closeContextMenu() }}
          onCut={() => { handleCut(); closeContextMenu() }}
          onPaste={() => { handlePaste(); closeContextMenu() }}
          onDownload={() => {
            if (selected.size > 1) handleDownloadZip()
            else {
              const item = displayItems[contextMenu.idx]
              const itemPath = item.path || (currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`)
              handleDownloadSingle(itemPath)
            }
            closeContextMenu()
          }}
          onShare={() => {
            const item = displayItems[contextMenu.idx]
            const itemPath = item.path || (currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`)
            handleShare(itemPath)
          }}
          onDelete={() => { setShowDeleteModal(true); closeContextMenu() }}
        />
      )}

      {/* Share Modal */}
      {shareModal && (
        <ShareModal
          filePath={shareModal.path}
          authHeaders={headers()}
          onClose={() => setShareModal(null)}
        />
      )}

      {/* Preview Modal */}
      {previewIndex !== null && (
        <ImagePreview
          images={previewableItems}
          currentIndex={previewIndex}
          currentPath={currentPath}
          authToken={token}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
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
