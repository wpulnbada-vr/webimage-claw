import { useState, useRef, useEffect } from 'react'

const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i

function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function FileGrid({ items, currentPath, selected, onSelect, onSelectAll, onNavigate, authToken, onRename, onPreview, onContextMenu }) {
  const [editingIdx, setEditingIdx] = useState(null)
  const [editName, setEditName] = useState('')
  const editRef = useRef(null)
  const clickTimer = useRef(null)

  const tokenParam = authToken ? `?token=${encodeURIComponent(authToken)}` : ''

  useEffect(() => {
    if (editingIdx !== null && editRef.current) {
      editRef.current.focus()
      const dotIdx = editName.lastIndexOf('.')
      editRef.current.setSelectionRange(0, dotIdx > 0 ? dotIdx : editName.length)
    }
  }, [editingIdx])

  const handleClickWithDelay = (singleAction, idx, name) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      setEditingIdx(idx)
      setEditName(name)
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null
        singleAction()
      }, 300)
    }
  }

  const commitEdit = (idx) => {
    const item = items[idx]
    if (editName && editName !== item.name) {
      const itemPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
      onRename(itemPath, editName)
    }
    setEditingIdx(null)
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      {/* Parent directory */}
      {currentPath !== '/' && (
        <div
          className="inline-flex flex-col items-center w-28 p-2 rounded-lg hover:bg-[#21262d] cursor-pointer align-top"
          onClick={() => {
            const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
            onNavigate(parent)
          }}
        >
          <div className="w-16 h-16 flex items-center justify-center">
            <svg className="w-10 h-10 text-accent" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </div>
          <span className="text-xs text-accent mt-1">..</span>
        </div>
      )}

      {/* Grid items */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-1">
        {items.map((item, idx) => {
          const isImage = item.type === 'file' && IMAGE_EXT.test(item.name)
          const itemPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
          const isChecked = selected.has(idx)
          const isEditing = editingIdx === idx

          return (
            <div
              key={item.name}
              className={`group relative flex flex-col items-center p-2 rounded-lg hover:bg-[#21262d] cursor-pointer transition-colors ${isChecked ? 'bg-accent/10 ring-1 ring-accent/30' : ''}`}
              onContextMenu={(e) => onContextMenu?.(e, idx)}
              onClick={(e) => {
                if (e.detail === 1 && !isEditing) {
                  if (e.ctrlKey || e.metaKey) {
                    onSelect(idx)
                  } else {
                    handleClickWithDelay(() => {
                      if (item.type === 'directory') onNavigate(itemPath)
                      else if (isImage) onPreview(idx)
                      else window.open(`/downloads${itemPath}${tokenParam}`, '_blank')
                    }, idx, item.name)
                  }
                }
              }}
            >
              {/* Checkbox overlay */}
              <div className={`absolute top-1 left-1 ${isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => { e.stopPropagation(); onSelect(idx) }}
                  className="accent-accent cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Icon / Thumbnail */}
              <div className="w-20 h-20 flex items-center justify-center overflow-hidden rounded">
                {item.type === 'directory' ? (
                  <svg className="w-12 h-12 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                ) : isImage ? (
                  <img
                    src={`/downloads${itemPath}${tokenParam}`}
                    alt=""
                    className="w-20 h-20 object-cover rounded"
                    loading="lazy"
                  />
                ) : (
                  <svg className="w-10 h-10 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
              </div>

              {/* Name */}
              {isEditing ? (
                <input
                  ref={editRef}
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit(idx)
                    if (e.key === 'Escape') setEditingIdx(null)
                  }}
                  onBlur={() => commitEdit(idx)}
                  onClick={e => e.stopPropagation()}
                  className="bg-[#21262d] border border-accent rounded px-1 py-0.5 text-[10px] text-text outline-none w-full text-center mt-1"
                />
              ) : (
                <span className="text-[10px] text-text mt-1 w-full text-center truncate px-1" title={item.name}>
                  {item.name}
                </span>
              )}

              {/* Size for files */}
              {item.type === 'file' && (
                <span className="text-[9px] text-muted">{formatSize(item.size)}</span>
              )}
              {item.type === 'directory' && item.childCount != null && (
                <span className="text-[9px] text-muted">{item.childCount}개</span>
              )}
            </div>
          )
        })}
      </div>

      {items.length === 0 && currentPath === '/' && (
        <div className="text-center text-muted text-sm py-8">빈 폴더입니다</div>
      )}
    </div>
  )
}
