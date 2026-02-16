import React, { useState } from 'react';

export default function ImageGrid({ images, folder }) {
  const [lightbox, setLightbox] = useState(null);

  if (!images || images.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        Select a job or start scraping to view images
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {folder && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted">{images.length} images</span>
          <a
            href={`/api/zip/${encodeURIComponent(folder)}`}
            className="text-xs text-accent hover:text-accent-hover px-3 py-1 border border-accent/30 rounded transition"
          >
            Download ZIP
          </a>
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
        {images.map((img, i) => (
          <div
            key={img.name || i}
            className="aspect-square bg-surface rounded overflow-hidden cursor-pointer hover:ring-2 ring-accent/50 transition"
            onClick={() => setLightbox(img)}
          >
            <img
              src={img.url}
              alt={img.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center cursor-pointer"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-w-[90vw] max-h-[90vh] object-contain"
          />
          <div className="absolute bottom-4 text-sm text-white/70">{lightbox.name}</div>
        </div>
      )}
    </div>
  );
}
