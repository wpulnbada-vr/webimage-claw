import { useState } from 'react'

export default function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '로그인 실패')
      localStorage.setItem('wih_token', data.token)
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-lg font-bold text-accent">WebImageClaw</h1>
          <p className="text-xs text-muted mt-1">파일 관리 기능을 사용하려면 로그인하세요</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-bg border border-border rounded-md text-sm text-text focus:outline-none focus:border-accent"
            autoFocus
          />
          {error && <p className="text-xs text-red">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/80 disabled:opacity-50 cursor-pointer"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
