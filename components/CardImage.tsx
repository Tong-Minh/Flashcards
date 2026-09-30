'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageOff, Maximize2 } from 'lucide-react'
import { IS_DESKTOP } from '@/lib/platform'
import { store } from '@/lib/store'

// An image in a card (a markup line "![alt](images/<file>)"). Images live in the desktop app's
// library folder, so the web app shows a placeholder instead. Enlarging is a corner button, not a
// click on the image, so tapping an image-only question still flips the card.
export function CardImage({ src, alt }: { src: string; alt: string }) {
  const [url,    setUrl]    = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    if (!IS_DESKTOP) return
    let alive = true
    store.imageUrl(src).then(u => { if (!alive) return; if (u) setUrl(u); else setFailed(true) }, () => alive && setFailed(true))
    return () => { alive = false }
  }, [src])

  useEffect(() => {
    if (!zoomed) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomed(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed])

  if (!IS_DESKTOP || failed) {
    return (
      <span className="card-image my-1.5 flex items-center gap-2 w-fit max-w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
        <ImageOff size={14} className="flex-shrink-0" />
        {IS_DESKTOP ? 'Image not found in this library' : 'Image (desktop app only)'}
      </span>
    )
  }
  if (!url) return <span className="card-image block my-1.5 h-24 w-40 max-w-full rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />

  return (
    <span className="card-image group relative block w-fit max-w-full max-h-[28rem] my-1.5 mx-auto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} draggable={false} className="block max-w-full max-h-[inherit] rounded-lg object-contain" />
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setZoomed(true) }}
        className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        aria-label="Enlarge image"
        title="Enlarge"
      >
        <Maximize2 size={14} />
      </button>
      {/* Portaled: cards animate with transforms, which would trap a fixed overlay; clicks stop here
          so they don't reach the card's flip handler */}
      {zoomed && createPortal(
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={e => { e.stopPropagation(); setZoomed(false) }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>,
        document.body,
      )}
    </span>
  )
}
