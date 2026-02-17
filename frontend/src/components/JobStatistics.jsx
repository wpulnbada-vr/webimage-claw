function formatDuration(sec) {
  if (sec < 60) return `${sec}초`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}분 ${s}초` : `${m}분`
}

function DonutChart({ rate }) {
  const green = Math.round(rate * 3.6) // 0-360
  return (
    <div className="relative w-24 h-24 mx-auto">
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `conic-gradient(var(--color-green) 0deg ${green}deg, var(--color-red) ${green}deg 360deg)`,
        }}
      />
      <div className="absolute inset-2 bg-surface rounded-full flex items-center justify-center">
        <span className="text-lg font-bold text-text">{rate}%</span>
      </div>
    </div>
  )
}

function BarChart({ items, valueKey, labelKey, maxValue }) {
  const max = maxValue || Math.max(...items.map(i => i[valueKey]), 1)
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="text-muted w-24 truncate text-right shrink-0" title={item[labelKey]}>
            {item[labelKey]}
          </span>
          <div className="flex-1 h-4 bg-[#21262d] rounded overflow-hidden">
            <div
              className="h-full bg-accent rounded transition-all duration-300"
              style={{ width: `${max > 0 ? (item[valueKey] / max) * 100 : 0}%` }}
            />
          </div>
          <span className="text-text w-10 text-right shrink-0 font-mono">{item[valueKey].toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function DailyChart({ daily }) {
  const maxJobs = Math.max(...daily.map(d => d.jobs), 1)
  return (
    <div className="flex items-end gap-px h-24">
      {daily.map((d, i) => {
        const h = maxJobs > 0 ? (d.jobs / maxJobs) * 100 : 0
        const dateLabel = d.date.slice(5) // MM-DD
        return (
          <div key={i} className="flex-1 flex flex-col items-center group relative" title={`${d.date}: ${d.jobs}건 / ${d.images}장`}>
            <div className="w-full flex flex-col justify-end h-20">
              <div
                className="w-full bg-accent rounded-t transition-all duration-300 min-h-[1px]"
                style={{ height: `${Math.max(h, d.jobs > 0 ? 4 : 0)}%` }}
              />
            </div>
            {i % 5 === 0 && (
              <span className="text-[9px] text-muted mt-0.5">{dateLabel}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function JobStatistics({ data }) {
  if (!data) return <div className="text-muted text-sm">로딩 중...</div>

  const { overview, bySite, byKeyword, daily } = data

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-5">
      <h3 className="text-sm font-semibold text-text">작업 통계</h3>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-[#21262d] rounded-md p-3 text-center">
          <div className="text-xl font-bold text-text">{overview.totalJobs}</div>
          <div className="text-xs text-muted">총 작업</div>
        </div>
        <div className="bg-[#21262d] rounded-md p-3 text-center">
          <div className="text-xl font-bold text-green">{overview.completed}</div>
          <div className="text-xs text-muted">성공</div>
        </div>
        <div className="bg-[#21262d] rounded-md p-3 text-center">
          <div className="text-xl font-bold text-accent">{overview.totalImages.toLocaleString()}</div>
          <div className="text-xs text-muted">총 이미지</div>
        </div>
        <div className="bg-[#21262d] rounded-md p-3 text-center">
          <div className="text-xl font-bold text-text">{formatDuration(overview.avgDurationSec)}</div>
          <div className="text-xs text-muted">평균 소요</div>
        </div>
      </div>

      {/* Success Rate Donut */}
      <div className="flex items-center gap-6">
        <DonutChart rate={overview.successRate} />
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-green inline-block" />
            <span className="text-muted">성공 {overview.completed}건</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-red inline-block" />
            <span className="text-muted">실패 {overview.failed}건</span>
          </div>
        </div>
      </div>

      {/* Site Top 10 */}
      {bySite.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-2">사이트별 (Top {bySite.length})</div>
          <BarChart items={bySite} valueKey="jobs" labelKey="site" />
        </div>
      )}

      {/* Keyword Tags */}
      {byKeyword.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-2">키워드별 (Top {byKeyword.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {byKeyword.map((kw, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 bg-[#21262d] border border-border rounded-full text-xs"
                title={`${kw.images.toLocaleString()}장`}
              >
                <span className="text-text">{kw.keyword}</span>
                <span className="text-muted">{kw.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Daily Activity */}
      {daily.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-2">최근 30일 활동</div>
          <DailyChart daily={daily} />
        </div>
      )}
    </div>
  )
}
