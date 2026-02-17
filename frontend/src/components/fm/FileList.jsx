const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i

function formatSize(bytes) {
  if (bytes == null) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

export default function FileList({ items, currentPath, selected, onSelect, onSelectAll, onNavigate }) {
  const allSelected = items.length > 0 && selected.size === items.length

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="w-8 p-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onSelectAll(!allSelected)}
                className="accent-accent cursor-pointer"
              />
            </th>
            <th className="text-left p-2 font-medium">이름</th>
            <th className="text-right p-2 font-medium w-24">크기</th>
            <th className="text-right p-2 font-medium w-28">수정일</th>
          </tr>
        </thead>
        <tbody>
          {/* Parent directory link */}
          {currentPath !== '/' && (
            <tr
              className="border-b border-border/50 hover:bg-[#21262d] cursor-pointer"
              onClick={() => {
                const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
                onNavigate(parent)
              }}
            >
              <td className="p-2" />
              <td className="p-2 text-accent">..</td>
              <td className="p-2" />
              <td className="p-2" />
            </tr>
          )}
          {items.map((item, idx) => {
            const isImage = item.type === 'file' && IMAGE_EXT.test(item.name)
            const itemPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
            const isChecked = selected.has(idx)

            return (
              <tr
                key={item.name}
                className={`border-b border-border/50 hover:bg-[#21262d] transition-colors ${isChecked ? 'bg-accent/10' : ''}`}
              >
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onSelect(idx)}
                    className="accent-accent cursor-pointer"
                  />
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    {item.type === 'directory' ? (
                      <svg className="w-4 h-4 text-accent shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                    ) : isImage ? (
                      <img
                        src={`/downloads${itemPath}`}
                        alt=""
                        className="w-6 h-6 rounded object-cover shrink-0 border border-border"
                        loading="lazy"
                      />
                    ) : (
                      <svg className="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    )}
                    {item.type === 'directory' ? (
                      <button
                        onClick={() => onNavigate(itemPath)}
                        className="text-accent hover:underline truncate cursor-pointer text-left"
                      >
                        {item.name}
                      </button>
                    ) : (
                      <a
                        href={`/downloads${itemPath}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-text hover:text-accent truncate"
                      >
                        {item.name}
                      </a>
                    )}
                  </div>
                </td>
                <td className="p-2 text-right text-muted whitespace-nowrap">{formatSize(item.size)}</td>
                <td className="p-2 text-right text-muted whitespace-nowrap">{formatDate(item.mtime)}</td>
              </tr>
            )
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-muted">빈 폴더입니다</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
