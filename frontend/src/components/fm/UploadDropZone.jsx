import { useState, useRef, useCallback } from 'react'

export default function UploadDropZone({ onUpload, children }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    setUploading(true)
    setProgress({ current: 0, total: files.length })

    // Batch upload (10 at a time)
    const BATCH_SIZE = 10
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)
      await onUpload(batch)
      setProgress({ current: Math.min(i + BATCH_SIZE, files.length), total: files.length })
    }

    setUploading(false)
  }, [onUpload])

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-accent/10 border-2 border-dashed border-accent rounded-lg flex items-center justify-center z-40 pointer-events-none">
          <div className="bg-surface/95 px-6 py-4 rounded-lg border border-accent text-center">
            <svg className="w-8 h-8 text-accent mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-sm text-accent font-medium">파일을 여기에 놓으세요</p>
          </div>
        </div>
      )}

      {/* Upload progress bar */}
      {uploading && (
        <div className="absolute bottom-0 left-0 right-0 bg-surface/95 border-t border-border px-4 py-2 z-40">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">{progress.current}/{progress.total} 업로드 중...</span>
            <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
