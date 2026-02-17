import { useState } from 'react'

export default function SetupScreen({ onComplete }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 4) return setError('비밀번호는 4자 이상이어야 합니다')
    if (password !== confirm) return setError('비밀번호가 일치하지 않습니다')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      localStorage.setItem('wih_token', data.token)
      onComplete()
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
          <h1 className="text-lg font-bold text-accent">WebImageHere</h1>
          <p className="text-xs text-muted mt-1">관리자 비밀번호를 설정하세요</p>
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
          <input
            type="password"
            placeholder="비밀번호 확인"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full px-3 py-2 bg-bg border border-border rounded-md text-sm text-text focus:outline-none focus:border-accent"
          />
          {error && <p className="text-xs text-red">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/80 disabled:opacity-50 cursor-pointer"
          >
            {loading ? '설정 중...' : '설정 완료'}
          </button>
        </form>
      </div>
    </div>
  )
}
