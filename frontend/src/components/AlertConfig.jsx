import { useState, useEffect } from 'react'

export default function AlertConfig() {
  const [config, setConfig] = useState({
    webhookUrl: '',
    enabled: false,
    notifyOnComplete: true,
    notifyOnFail: true,
    notifyOnDiskWarning: true,
    diskWarningThresholdMB: 50000,
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [showUrl, setShowUrl] = useState(false)

  useEffect(() => {
    fetch('/api/monitor/config')
      .then(r => r.json())
      .then(data => {
        setConfig(prev => ({
          ...prev,
          enabled: data.enabled ?? prev.enabled,
          notifyOnComplete: data.notifyOnComplete ?? prev.notifyOnComplete,
          notifyOnFail: data.notifyOnFail ?? prev.notifyOnFail,
          notifyOnDiskWarning: data.notifyOnDiskWarning ?? prev.notifyOnDiskWarning,
          diskWarningThresholdMB: data.diskWarningThresholdMB ?? prev.diskWarningThresholdMB,
          // webhookUrl is masked from server, load from localStorage instead
        }))
        // Load full webhook URL from localStorage
        const cached = localStorage.getItem('monitor-webhook')
        if (cached) setConfig(prev => ({ ...prev, webhookUrl: cached }))
      })
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/monitor/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        localStorage.setItem('monitor-webhook', config.webhookUrl)
        setMessage('저장 완료')
      } else {
        setMessage('저장 실패')
      }
    } catch {
      setMessage('저장 실패')
    }
    setSaving(false)
    setTimeout(() => setMessage(''), 3000)
  }

  const handleTest = async () => {
    setTesting(true)
    setMessage('')
    try {
      const res = await fetch('/api/monitor/test-alert', { method: 'POST' })
      const data = await res.json()
      setMessage(data.ok ? '테스트 알림 전송 완료' : `전송 실패: ${data.error || ''}`)
    } catch {
      setMessage('전송 실패')
    }
    setTesting(false)
    setTimeout(() => setMessage(''), 5000)
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-text">Discord 알림</h3>

      {/* Webhook URL */}
      <div className="space-y-1">
        <label className="text-xs text-muted">Webhook URL</label>
        <div className="flex gap-2">
          <input
            type={showUrl ? 'text' : 'password'}
            value={config.webhookUrl}
            onChange={e => setConfig(c => ({ ...c, webhookUrl: e.target.value }))}
            placeholder="https://discord.com/api/webhooks/..."
            className="flex-1 bg-[#21262d] border border-border rounded-md px-3 py-1.5 text-sm text-text placeholder-[#484f58] focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => setShowUrl(v => !v)}
            className="px-3 py-1.5 bg-[#21262d] border border-border rounded-md text-xs text-muted hover:text-text"
          >
            {showUrl ? '숨김' : '표시'}
          </button>
        </div>
      </div>

      {/* Enable Toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
          className="w-4 h-4 rounded accent-accent"
        />
        <span className="text-sm text-text">알림 활성화</span>
      </label>

      {/* Notification Toggles */}
      <div className="space-y-2 pl-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.notifyOnComplete}
            onChange={e => setConfig(c => ({ ...c, notifyOnComplete: e.target.checked }))}
            className="w-3.5 h-3.5 rounded accent-green"
          />
          <span className="text-xs text-muted">작업 완료 시</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.notifyOnFail}
            onChange={e => setConfig(c => ({ ...c, notifyOnFail: e.target.checked }))}
            className="w-3.5 h-3.5 rounded accent-red"
          />
          <span className="text-xs text-muted">작업 실패 시</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.notifyOnDiskWarning}
            onChange={e => setConfig(c => ({ ...c, notifyOnDiskWarning: e.target.checked }))}
            className="w-3.5 h-3.5 rounded accent-yellow"
          />
          <span className="text-xs text-muted">디스크 용량 경고</span>
        </label>
      </div>

      {/* Disk Threshold */}
      <div className="space-y-1">
        <label className="text-xs text-muted">디스크 경고 임계값 (MB)</label>
        <input
          type="number"
          value={config.diskWarningThresholdMB}
          onChange={e => setConfig(c => ({ ...c, diskWarningThresholdMB: parseInt(e.target.value) || 0 }))}
          className="w-full bg-[#21262d] border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 bg-accent-dim hover:bg-accent text-white text-sm rounded-md transition-colors disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !config.webhookUrl}
          className="px-4 py-1.5 bg-[#21262d] border border-border hover:border-accent text-sm text-muted hover:text-text rounded-md transition-colors disabled:opacity-50"
        >
          {testing ? '전송 중...' : '테스트'}
        </button>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`text-xs ${message.includes('실패') ? 'text-red' : 'text-green'}`}>
          {message}
        </div>
      )}
    </div>
  )
}
