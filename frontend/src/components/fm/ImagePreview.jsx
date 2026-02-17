import { useEffect, useCallback, useState } from 'react'

const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv)$/i
const AUDIO_EXT = /\.(mp3|wav|ogg|flac|aac|m4a)$/i
const TEXT_EXT = /\.(txt|json|md|log|csv|js|py|ts|jsx|tsx|html|css|xml|yml|yaml|sh|conf|ini|toml|env|sql)$/i

function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function getMediaType(name) {
  if (IMAGE_EXT.test(name)) return 'image'
  if (VIDEO_EXT.test(name)) return 'video'
  if (AUDIO_EXT.test(name)) return 'audio'
  if (TEXT_EXT.test(name)) return 'text'
  return 'unknown'
}

function TextPreview({ src }) {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(src)
      .then(res => res.text())
      .then(text => { setContent(text); setLoading(false) })
      .catch(() => { setContent('(파일을 읽을 수 없습니다)'); setLoading(false) })
  }, [src])

  if (loading) return <div className="text-muted text-sm p-4">로딩 중...</div>

  return (
    <pre className="max-w-[85vw] max-h-[75vh] overflow-auto bg-[#0d1117] text-text text-xs p-4 rounded-lg border border-border whitespace-pre-wrap break-words font-mono">
      {content}
    </pre>
  )
}

export default function ImagePreview({ images, currentIndex, currentPath, authToken, onClose, onNavigate }) {
  const image = images[currentIndex]
  if (!image) return null

  const tokenParam = authToken ? `?token=${encodeURIComponent(authToken)}` : ''
  const itemPath = image.path || (currentPath === '/' ? `/${image.name}` : `${currentPath}/${image.name}`)
  const src = `/downloads${itemPath}${tokenParam}`
  const mediaType = getMediaType(image.name)

  const goPrev = useCallback(() => {
    if (currentIndex > 0) onNavigate(currentIndex - 1)
  }, [currentIndex, onNavigate])

  const goNext = useCallback(() => {
    if (currentIndex < images.length - 1) onNavigate(currentIndex + 1)
  }, [currentIndex, images.length, onNavigate])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, goPrev, goNext])

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 w-8 h-8 bg-[#21262d] border border-border rounded-full flex items-center justify-center text-muted hover:text-white z-10 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Navigation arrows */}
        {currentIndex > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 w-10 h-10 bg-[#21262d] border border-border rounded-full flex items-center justify-center text-muted hover:text-white cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {currentIndex < images.length - 1 && (
          <button
            onClick={goNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 w-10 h-10 bg-[#21262d] border border-border rounded-full flex items-center justify-center text-muted hover:text-white cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Content */}
        {mediaType === 'image' && (
          <img
            src={src}
            alt={image.name}
            className="max-w-[85vw] max-h-[80vh] object-contain rounded-lg"
          />
        )}
        {mediaType === 'video' && (
          <video
            src={src}
            controls
            autoPlay
            className="max-w-[85vw] max-h-[80vh] rounded-lg"
          />
        )}
        {mediaType === 'audio' && (
          <div className="bg-surface border border-border rounded-lg p-8 flex flex-col items-center gap-4 min-w-[300px]">
            <svg className="w-16 h-16 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
            </svg>
            <audio src={src} controls autoPlay className="w-full" />
          </div>
        )}
        {mediaType === 'text' && (
          <TextPreview src={src} />
        )}

        {/* Info bar */}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted bg-surface/90 px-4 py-2 rounded-lg border border-border">
          <span className="text-text font-medium truncate max-w-[300px]">{image.name}</span>
          <span>{formatSize(image.size)}</span>
          <span>{currentIndex + 1} / {images.length}</span>
        </div>
      </div>
    </div>
  )
}
