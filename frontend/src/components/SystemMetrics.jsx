function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts = []
  if (d > 0) parts.push(`${d}일`)
  if (h > 0) parts.push(`${h}시간`)
  if (m > 0) parts.push(`${m}분`)
  if (parts.length === 0) parts.push(`${s}초`)
  return parts.join(' ')
}

function ProgressBar({ value, max, color = 'bg-accent', label, detail }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="text-text">{detail}</span>
      </div>
      <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function SystemMetrics({ data }) {
  if (!data) return <div className="text-muted text-sm">로딩 중...</div>

  const memUsedPct = data.memory.systemTotalMB > 0
    ? ((data.memory.systemTotalMB - data.memory.systemFreeMB) / data.memory.systemTotalMB * 100).toFixed(1)
    : 0
  const diskUsedPct = data.disk.diskTotalMB > 0
    ? ((data.disk.diskTotalMB - data.disk.diskFreeMB) / data.disk.diskTotalMB * 100).toFixed(1)
    : 0

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-text">시스템 상태</h3>

      {/* Uptime + Server Start */}
      <div className="flex gap-4 text-xs">
        <div>
          <span className="text-muted">업타임</span>
          <div className="text-text font-mono">{formatUptime(data.uptime)}</div>
        </div>
        <div>
          <span className="text-muted">시작</span>
          <div className="text-text font-mono">{new Date(data.serverStart).toLocaleString('ko-KR')}</div>
        </div>
      </div>

      {/* CPU */}
      <ProgressBar
        value={data.cpu.percent}
        max={100}
        color={data.cpu.percent > 80 ? 'bg-red' : data.cpu.percent > 50 ? 'bg-yellow' : 'bg-green'}
        label="CPU (Node.js)"
        detail={`${data.cpu.percent}%`}
      />

      {/* Memory - Heap */}
      <ProgressBar
        value={data.memory.heapUsedMB}
        max={data.memory.heapTotalMB}
        color="bg-accent"
        label="Heap 메모리"
        detail={`${data.memory.heapUsedMB} / ${data.memory.heapTotalMB} MB`}
      />

      {/* Memory - System */}
      <ProgressBar
        value={data.memory.systemTotalMB - data.memory.systemFreeMB}
        max={data.memory.systemTotalMB}
        color={memUsedPct > 90 ? 'bg-red' : memUsedPct > 70 ? 'bg-yellow' : 'bg-green'}
        label="시스템 메모리"
        detail={`${memUsedPct}% (잔여 ${(data.memory.systemFreeMB / 1024).toFixed(1)} GB)`}
      />

      {/* Disk */}
      <ProgressBar
        value={data.disk.diskTotalMB - data.disk.diskFreeMB}
        max={data.disk.diskTotalMB}
        color={diskUsedPct > 90 ? 'bg-red' : diskUsedPct > 75 ? 'bg-yellow' : 'bg-green'}
        label="디스크"
        detail={`${diskUsedPct}% (잔여 ${(data.disk.diskFreeMB / 1024).toFixed(0)} GB)`}
      />

      {/* Downloads Info */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-[#21262d] rounded-md p-2">
          <div className="text-lg font-bold text-accent">{data.disk.downloadsFolders}</div>
          <div className="text-xs text-muted">폴더</div>
        </div>
        <div className="bg-[#21262d] rounded-md p-2">
          <div className="text-lg font-bold text-accent">{data.disk.downloadsFiles.toLocaleString()}</div>
          <div className="text-xs text-muted">파일</div>
        </div>
        <div className="bg-[#21262d] rounded-md p-2">
          <div className="text-lg font-bold text-accent">{(data.disk.downloadsSizeMB / 1024).toFixed(1)} GB</div>
          <div className="text-xs text-muted">용량</div>
        </div>
      </div>

      {/* Puppeteer + Queue */}
      <div className="flex gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${data.puppeteer.activeBrowsers > 0 ? 'bg-green animate-pulse' : 'bg-[#484f58]'}`} />
          <span className="text-muted">브라우저 {data.puppeteer.activeBrowsers}/{data.puppeteer.maxConcurrent}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${data.queue.running > 0 ? 'bg-green animate-pulse' : 'bg-[#484f58]'}`} />
          <span className="text-muted">실행 {data.queue.running} / 대기 {data.queue.queued}</span>
        </div>
      </div>
    </div>
  )
}
