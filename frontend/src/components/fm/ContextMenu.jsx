import { useRef, useEffect } from 'react'

export default function ContextMenu({
  x, y, selectedCount, item, hasClipboard,
  onClose, onOpen, onRename, onCopy, onCut, onPaste, onDownload, onShare, onDelete
}) {
  const menuRef = useRef(null)

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const parent = menuRef.current.parentElement?.getBoundingClientRect() || { width: window.innerWidth, height: window.innerHeight }
    // Adjust if going off-screen
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${x - rect.width}px`
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${y - rect.height}px`
    }
  }, [x, y])

  const MenuItem = ({ label, shortcut, onClick, danger }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-4 hover:bg-[#21262d] cursor-pointer ${danger ? 'text-red hover:text-red' : 'text-text'}`}
    >
      <span>{label}</span>
      {shortcut && <span className="text-muted text-[10px]">{shortcut}</span>}
    </button>
  )

  const Divider = () => <div className="border-t border-border my-1" />

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-surface border border-border rounded-lg py-1 shadow-lg min-w-[180px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem label="열기" onClick={onOpen} />
      <Divider />
      <MenuItem label="이름 변경" shortcut="F2" onClick={onRename} />
      <MenuItem label="복사" shortcut="Ctrl+C" onClick={onCopy} />
      <MenuItem label="잘라내기" shortcut="Ctrl+X" onClick={onCut} />
      {hasClipboard && <MenuItem label="붙여넣기" shortcut="Ctrl+V" onClick={onPaste} />}
      <Divider />
      <MenuItem label="다운로드" onClick={onDownload} />
      {item?.type === 'file' && <MenuItem label="공유 링크" onClick={onShare} />}
      <Divider />
      <MenuItem label={`삭제${selectedCount > 1 ? ` (${selectedCount}개)` : ''}`} shortcut="Del" onClick={onDelete} danger />
    </div>
  )
}
