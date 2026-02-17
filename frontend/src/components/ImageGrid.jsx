import { useState, useEffect } from 'react'

export default function ImageGrid({ folder }) {
  const [files, setFiles] = useState([])

  useEffect(() => {
    fetch(`/api/folder-files/${encodeURIComponent(folder)}`)
      .then(r => r.json())
      .then(setFiles)
      .catch(() => {})
  }, [folder])

  if (files.length === 0) return null

  const shown = files.slice(0, 40)

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold">{files.length}개 이미지</span>
        <div className="flex gap-3">
          <a
            href={`/downloads/${encodeURIComponent(folder)}/`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent hover:underline"
          >
            폴더 열기
          </a>
          <a
            href={`/api/zip/${encodeURIComponent(folder)}`}
            download
            className="text-xs text-green hover:underline"
            onClick={(e) => {
              e.preventDefault()
              const a = document.createElement('a')
              a.href = `/api/zip/${encodeURIComponent(folder)}`
              a.download = `${folder}.zip`
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
            }}
          >
            ZIP 다운로드
          </a>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
        {shown.map(file => (
          <div
            key={file.name}
            className="aspect-square rounded overflow-hidden border border-border cursor-pointer hover:border-accent transition-colors"
            onClick={() => window.open(file.url, '_blank')}
          >
            <img src={file.url} loading="lazy" alt={file.name} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
      {files.length > 40 && (
        <div className="text-xs text-muted mt-2">... 외 {files.length - 40}개</div>
      )}
    </div>
  )
}
