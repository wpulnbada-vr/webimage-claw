import { useState } from 'react'

const MAX_URLS = 3
const MAX_KEYWORDS = 10

export default function InputForm({ onStart }) {
  const [urls, setUrls] = useState([''])
  const [keywords, setKeywords] = useState([''])
  const [submitting, setSubmitting] = useState(false)

  const updateUrl = (i, val) => {
    const next = [...urls]
    next[i] = val
    setUrls(next)
  }

  const addUrl = () => {
    if (urls.length < MAX_URLS) setUrls([...urls, ''])
  }

  const removeUrl = (i) => {
    if (urls.length > 1) setUrls(urls.filter((_, idx) => idx !== i))
  }

  const updateKeyword = (i, val) => {
    const next = [...keywords]
    next[i] = val
    setKeywords(next)
  }

  const addKeyword = () => {
    if (keywords.length < MAX_KEYWORDS) setKeywords([...keywords, ''])
  }

  const removeKeyword = (i) => {
    if (keywords.length > 1) setKeywords(keywords.filter((_, idx) => idx !== i))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validUrls = urls.map(u => u.trim()).filter(Boolean)
    const validKeywords = keywords.map(k => k.trim()).filter(Boolean)
    if (validUrls.length === 0) return

    // If no keywords, use empty string (direct URL mode)
    const kws = validKeywords.length > 0 ? validKeywords : ['']

    setSubmitting(true)
    await onStart(validUrls, kws)
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-4 space-y-4">
      {/* URLs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-muted uppercase tracking-wide">
            Target URLs ({urls.length}/{MAX_URLS})
          </label>
          {urls.length < MAX_URLS && (
            <button type="button" onClick={addUrl}
              className="text-xs text-accent hover:text-accent-dim cursor-pointer">
              + Add URL
            </button>
          )}
        </div>
        <div className="space-y-2">
          {urls.map((url, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={e => updateUrl(i, e.target.value)}
                placeholder="https://www.everiaclub.com/Korea.html"
                required={i === 0}
                className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-accent transition-colors"
              />
              {urls.length > 1 && (
                <button type="button" onClick={() => removeUrl(i)}
                  className="text-red hover:opacity-80 text-sm px-2 cursor-pointer">✕</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Keywords */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-muted uppercase tracking-wide">
            Keywords ({keywords.length}/{MAX_KEYWORDS})
          </label>
          {keywords.length < MAX_KEYWORDS && (
            <button type="button" onClick={addKeyword}
              className="text-xs text-accent hover:text-accent-dim cursor-pointer">
              + Add Keyword
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {keywords.map((kw, i) => (
            <div key={i} className="flex gap-1">
              <input
                type="text"
                value={kw}
                onChange={e => updateKeyword(i, e.target.value)}
                placeholder={`키워드 ${i + 1}`}
                className="w-40 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-accent transition-colors"
              />
              {keywords.length > 1 && (
                <button type="button" onClick={() => removeKeyword(i)}
                  className="text-red hover:opacity-80 text-sm px-1 cursor-pointer">✕</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          {urls.filter(u => u.trim()).length} URL × {keywords.filter(k => k.trim()).length || 1} keyword = {urls.filter(u => u.trim()).length * (keywords.filter(k => k.trim()).length || 1)} jobs
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setUrls(['']); setKeywords(['']); }}
            className="border border-border hover:border-muted text-muted hover:text-text font-semibold px-4 py-2 rounded-md transition-colors cursor-pointer"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent-dim hover:bg-accent text-white font-semibold px-6 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? 'Starting...' : 'Start'}
          </button>
        </div>
      </div>
    </form>
  )
}
