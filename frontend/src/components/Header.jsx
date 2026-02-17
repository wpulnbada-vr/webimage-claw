export default function Header({ currentTab, onTabChange, authenticated, onLogout }) {
  const tabs = [
    { id: 'jobs', label: '작업' },
    { id: 'monitor', label: '모니터링' },
    { id: 'files', label: '파일' },
  ]

  const handleTabChange = (tabId) => {
    if (tabId === 'files' && !authenticated) {
      // Trigger login flow by attempting to switch — AuthGate will handle
    }
    onTabChange(tabId)
  }

  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-accent">WebImageClaw</h1>
        <span className="text-sm text-muted hidden sm:inline">Web Image Downloader + OpenClaw</span>
      </div>
      <div className="flex items-center gap-3">
        <nav className="flex gap-1 bg-[#21262d] rounded-lg p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                currentTab === tab.id
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {authenticated && (
          <button
            onClick={onLogout}
            className="text-xs text-muted hover:text-red transition-colors cursor-pointer"
          >
            로그아웃
          </button>
        )}
      </div>
    </header>
  )
}
