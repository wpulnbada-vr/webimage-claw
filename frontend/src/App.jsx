import { useState, useCallback, useEffect } from 'react'
import Header from './components/Header'
import InputForm from './components/InputForm'
import JobPanel from './components/JobPanel'
import Sidebar from './components/Sidebar'
import MonitorDashboard from './components/MonitorDashboard'
import AuthGate, { useAuth } from './components/AuthGate'
import FileManager from './components/FileManager'

function MainApp() {
  const [currentTab, setCurrentTab] = useState('jobs')
  const [activeJobs, setActiveJobs] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const auth = useAuth()

  useEffect(() => {
    const loadJobs = () => {
      fetch('/api/jobs')
        .then(r => r.json())
        .then(serverJobs => {
          const running = serverJobs.filter(j => j.status === 'running' || j.status === 'queued')
          setActiveJobs(prev => {
            const existingIds = new Set(prev.map(j => j.jobId))
            const newJobs = running
              .filter(j => !existingIds.has(j.id))
              .map(j => ({ jobId: j.id, url: j.url, keyword: j.keyword, status: j.status }))
            if (newJobs.length > 0) return [...prev, ...newJobs]
            return prev
          })
        })
        .catch(() => {})
    }
    loadJobs()

    const onVisible = () => {
      if (document.visibilityState === 'visible') loadJobs()
    }
    const onFocus = () => loadJobs()

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const handleStart = useCallback(async (urls, keywords) => {
    const newJobs = []
    for (const url of urls) {
      for (const keyword of keywords) {
        try {
          const res = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, keyword }),
          })
          const data = await res.json()
          if (res.ok) {
            newJobs.push({ jobId: data.jobId, url, keyword, status: data.status })
          }
        } catch {}
      }
    }
    if (newJobs.length > 0) {
      setActiveJobs(prev => [...prev, ...newJobs])
    }
  }, [])

  const handleJobDone = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  const handleDelete = useCallback((jobId) => {
    setActiveJobs(prev => prev.filter(j => j.jobId !== jobId))
    setRefreshKey(k => k + 1)
  }, [])

  return (
    <div className="min-h-screen">
      <Header currentTab={currentTab} onTabChange={setCurrentTab} authenticated={auth?.authenticated} onLogout={auth?.logout} />
      <main className="p-4 max-w-[1600px] mx-auto">
        {currentTab === 'jobs' ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
            <div className="space-y-4">
              <InputForm onStart={handleStart} />
              {activeJobs.map(job => (
                <JobPanel
                  key={job.jobId}
                  jobId={job.jobId}
                  url={job.url}
                  keyword={job.keyword}
                  onDone={handleJobDone}
                  onDelete={handleDelete}
                />
              ))}
            </div>
            <Sidebar refreshKey={refreshKey} onDeleteHistory={(id) => {
              setActiveJobs(prev => prev.filter(j => j.jobId !== id))
              setRefreshKey(k => k + 1)
            }} />
          </div>
        ) : currentTab === 'monitor' ? (
          <MonitorDashboard />
        ) : (
          <FileManager />
        )}
      </main>
    </div>
  )
}

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => {
        setNeedsAuth(!data.setupComplete)
        setChecked(true)
      })
      .catch(() => setChecked(true))
  }, [])

  if (!checked) {
    return <div className="min-h-screen flex items-center justify-center text-muted text-sm">로딩 중...</div>
  }

  return (
    <AuthGate requireAuth={needsAuth}>
      <MainApp />
    </AuthGate>
  )
}
