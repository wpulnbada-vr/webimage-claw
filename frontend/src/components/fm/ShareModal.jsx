import { useState } from 'react'

const DURATIONS = [
  { label: '1시간', hours: 1 },
  { label: '6시간', hours: 6 },
  { label: '24시간', hours: 24 },
  { label: '3일', hours: 72 },
  { label: '7일', hours: 168 },
]

export default function ShareModal({ filePath, authHeaders, onClose }) {
  const [selectedHours, setSelectedHours] = useState(24)
  const [shareUrl, setShareUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/filemanager/share', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ filePath, hours: selectedHours }),
      })
      if (res.ok) {
        const data = await res.json()
        setShareUrl(`${window.location.origin}${data.url}`)
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg p-5 max-w-md mx-4 space-y-4 w-full" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text">공유 링크 생성</h3>
        <p className="text-xs text-muted truncate">{filePath}</p>

        {!shareUrl ? (
          <>
            <div className="space-y-2">
              <label className="text-xs text-muted">만료 시간</label>
              <div className="flex gap-2 flex-wrap">
                {DURATIONS.map(d => (
                  <button
                    key={d.hours}
                    onClick={() => setSelectedHours(d.hours)}
                    className={`px-3 py-1 text-xs rounded-md cursor-pointer ${
                      selectedHours === d.hours
                        ? 'bg-accent text-white'
                        : 'bg-[#21262d] text-text hover:bg-[#30363d]'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted hover:text-text bg-[#21262d] rounded-md cursor-pointer">
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="px-3 py-1.5 text-xs text-white bg-accent rounded-md hover:bg-accent/80 cursor-pointer disabled:opacity-50"
              >
                {loading ? '생성 중...' : '링크 생성'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-2 py-1.5 text-xs bg-bg border border-border rounded-md text-text"
              />
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs text-white bg-accent rounded-md hover:bg-accent/80 cursor-pointer whitespace-nowrap"
              >
                {copied ? '복사됨!' : '복사'}
              </button>
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted hover:text-text bg-[#21262d] rounded-md cursor-pointer">
                닫기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
