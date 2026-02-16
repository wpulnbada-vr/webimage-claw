import React, { useState } from 'react';

export default function InputForm({ onSubmit }) {
  const [url, setUrl] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    await onSubmit(url.trim(), keyword.trim());
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface border-b border-border p-4 shrink-0">
      <div className="flex gap-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (https://...)"
          required
          className="flex-1 bg-bg border border-border rounded px-3 py-2 text-sm text-text placeholder-muted focus:border-accent focus:outline-none transition"
        />
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Keyword (optional)"
          className="w-48 bg-bg border border-border rounded px-3 py-2 text-sm text-text placeholder-muted focus:border-accent focus:outline-none transition"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="bg-accent hover:bg-accent-hover text-bg font-medium px-5 py-2 rounded text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Starting...' : 'Scrape'}
        </button>
      </div>
    </form>
  );
}
