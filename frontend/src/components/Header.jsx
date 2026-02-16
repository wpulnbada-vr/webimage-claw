import React from 'react';

export default function Header() {
  const openDownloads = () => {
    if (window.electronAPI?.openDownloads) {
      window.electronAPI.openDownloads();
    }
  };

  return (
    <header className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-accent">WebImageClaw</h1>
        <span className="text-xs text-muted">Image Scraper</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={openDownloads}
          className="text-xs text-muted hover:text-text px-2 py-1 rounded hover:bg-surface-hover transition"
        >
          Downloads
        </button>
      </div>
    </header>
  );
}
