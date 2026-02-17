import { useState, useRef } from 'react'

export default function FileToolbar({
  currentPath, selectedCount, onUpload, onMkdir, onDelete, onDownloadZip, onRefresh,
  searchQuery, onSearchChange, sortBy, sortOrder, onSortChange, viewMode, onViewModeChange
}) {
  const [showMkdir, setShowMkdir] = useState(false)
  const [folderName, setFolderName] = useState('')
  const fileInputRef = useRef(null)
  const searchTimer = useRef(null)

  const handleMkdir = () => {
    if (!folderName.trim()) return
    onMkdir(folderName.trim())
    setFolderName('')
    setShowMkdir(false)
  }

  const handleSearchInput = (e) => {
    const value = e.target.value
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      onSearchChange(value)
    }, 300)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { onUpload(e.target.files); e.target.value = '' }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent/80 cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        업로드
      </button>

      {/* New Folder */}
      {showMkdir ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={folderName}
            onChange={e => setFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleMkdir()}
            placeholder="폴더 이름"
            className="px-2 py-1 text-xs bg-bg border border-border rounded-md text-text focus:outline-none focus:border-accent w-32"
            autoFocus
          />
          <button onClick={handleMkdir} className="text-xs text-green hover:text-green/80 cursor-pointer">확인</button>
          <button onClick={() => { setShowMkdir(false); setFolderName('') }} className="text-xs text-muted hover:text-text cursor-pointer">취소</button>
        </div>
      ) : (
        <button
          onClick={() => setShowMkdir(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#21262d] text-text rounded-md hover:bg-[#30363d] cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          새 폴더
        </button>
      )}

      {/* Refresh */}
      <button
        onClick={onRefresh}
        className="px-2 py-1.5 text-xs text-muted hover:text-text cursor-pointer"
        title="새로고침"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-border mx-1" />

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="검색..."
          defaultValue={searchQuery}
          onChange={handleSearchInput}
          className="pl-7 pr-2 py-1 text-xs bg-bg border border-border rounded-md text-text focus:outline-none focus:border-accent w-40"
        />
      </div>

      {/* Sort dropdown */}
      <select
        value={`${sortBy}-${sortOrder}`}
        onChange={(e) => {
          const [by, ord] = e.target.value.split('-')
          onSortChange(by, ord)
        }}
        className="px-2 py-1 text-xs bg-bg border border-border rounded-md text-text focus:outline-none focus:border-accent cursor-pointer"
      >
        <option value="name-asc">이름 ↑</option>
        <option value="name-desc">이름 ↓</option>
        <option value="size-asc">크기 ↑</option>
        <option value="size-desc">크기 ↓</option>
        <option value="date-asc">날짜 ↑</option>
        <option value="date-desc">날짜 ↓</option>
        <option value="type-asc">종류 ↑</option>
        <option value="type-desc">종류 ↓</option>
      </select>

      {/* View mode toggle */}
      <div className="flex border border-border rounded-md overflow-hidden">
        <button
          onClick={() => onViewModeChange('list')}
          className={`px-2 py-1 cursor-pointer ${viewMode === 'list' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-text'}`}
          title="리스트 보기"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </button>
        <button
          onClick={() => onViewModeChange('grid')}
          className={`px-2 py-1 cursor-pointer ${viewMode === 'grid' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-text'}`}
          title="그리드 보기"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
        </button>
      </div>

      {/* Selection actions */}
      {selectedCount > 0 && (
        <>
          <div className="w-px h-5 bg-border mx-1" />
          <span className="text-xs text-muted">{selectedCount}개 선택</span>
          <button
            onClick={onDownloadZip}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green/20 text-green rounded-md hover:bg-green/30 cursor-pointer"
          >
            ZIP 다운로드
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red/20 text-red rounded-md hover:bg-red/30 cursor-pointer"
          >
            삭제
          </button>
        </>
      )}
    </div>
  )
}
