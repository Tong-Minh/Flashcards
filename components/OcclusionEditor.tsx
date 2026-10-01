'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { store } from '@/lib/store'
import { imageFileFrom, prepareImage } from '@/lib/images'
import { notify } from '@/lib/dialogs'
import type { Occlusion, OcclusionShape } from '@/lib/types'

// Making an image occlusion card (desktop app): pick or paste an image, drag boxes over what to
// hide, and number them. Boxes with the same number are one card; each number is studied on its own.
// Positions are stored as 0–1 fractions of the image, so they fit any size it's shown at.

type Drag =
  | { kind: 'draw'; x0: number; y0: number }
  | { kind: 'move'; index: number; dx: number; dy: number }
  | { kind: 'resize'; index: number }

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

// The selected box's card number. Its own text while typing, so clearing it to type a new number
// works; the box changes once the text is a whole number from 1 up.
function CardNumber({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  return (
    <input
      type="number"
      min={1}
      value={text}
      onChange={e => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (Number.isInteger(n) && n >= 1) onChange(n)
      }}
      onBlur={() => setText(String(value))}
      className="w-16 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
    />
  )
}
const MIN = 0.01

export function OcclusionEditor({ value, onChange }: { value: Occlusion | null; onChange: (o: Occlusion | null) => void }) {
  const [url,      setUrl]      = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [busy,     setBusy]     = useState(false)
  const [preview,  setPreview]  = useState<OcclusionShape | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    if (!value?.image) { setUrl(null); return }
    let alive = true
    store.mediaUrl(value.image).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [value?.image])

  async function useImage(file: File) {
    setBusy(true)
    try {
      const { bytes, ext } = await prepareImage(file, file.name)
      const image = await store.saveMedia(bytes, ext)
      onChange({ image, mode: value?.mode ?? 'hide_all', shapes: value?.image ? value.shapes : [] })
    } catch {
      notify('Could not use that image.')
    } finally {
      setBusy(false)
    }
  }

  function pick() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => { const f = input.files?.[0]; if (f) useImage(f) }
    input.click()
  }

  // Pointer position as fractions of the image
  function at(e: React.PointerEvent): { x: number; y: number } {
    const r = area.current!.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }
  }

  const shapes = value?.shapes ?? []
  const nextOrd = shapes.length ? Math.max(...shapes.map(s => s.ord)) + 1 : 0
  const setShapes = (next: OcclusionShape[]) => value && onChange({ ...value, shapes: next })

  function onDown(e: React.PointerEvent) {
    if (!value || e.button !== 0) return
    const p = at(e)
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-shape]')
    if (target) {
      const index = Number(target.dataset.shape)
      setSelected(index)
      drag.current = (e.target as HTMLElement).dataset.handle
        ? { kind: 'resize', index }
        : { kind: 'move', index, dx: p.x - shapes[index].x, dy: p.y - shapes[index].y }
    } else {
      setSelected(null)
      drag.current = { kind: 'draw', x0: p.x, y0: p.y }
    }
    area.current!.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d || !value) return
    const p = at(e)
    if (d.kind === 'draw') {
      setPreview({ x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0), ord: nextOrd })
    } else if (d.kind === 'move') {
      const s = shapes[d.index]
      setShapes(shapes.map((o, i) => i === d.index ? { ...o, x: clamp(p.x - d.dx, 0, 1 - s.w), y: clamp(p.y - d.dy, 0, 1 - s.h) } : o))
    } else {
      setShapes(shapes.map((o, i) => i === d.index ? { ...o, w: Math.max(MIN, p.x - o.x), h: Math.max(MIN, p.y - o.y) } : o))
    }
  }

  function onUp() {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'draw' && preview && preview.w > MIN && preview.h > MIN) {
      setShapes([...shapes, preview])
      setSelected(shapes.length)
    }
    setPreview(null)
  }

  // Delete / Backspace removes the selected box
  useEffect(() => {
    if (selected === null) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !(e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) {
        e.preventDefault()
        setShapes(shapes.filter((_, i) => i !== selected))
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const cardCount = new Set(shapes.map(s => s.ord)).size
  const sel = selected !== null ? shapes[selected] : null

  if (!value?.image) {
    return (
      <div
        onPaste={e => { const f = imageFileFrom(e.clipboardData); if (f) { e.preventDefault(); useImage(f) } }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { const f = imageFileFrom(e.dataTransfer); if (f) { e.preventDefault(); useImage(f) } }}
        tabIndex={0}
        className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-10 text-center outline-none focus:border-indigo-300"
      >
        <ImagePlus size={28} className="mx-auto text-indigo-500 mb-2" />
        <button type="button" onClick={pick} disabled={busy} className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
          {busy ? 'Adding…' : 'Choose an image'}
        </button>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">or paste or drop one here (a diagram, a map, a labeled figure…)</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 text-pretty">
        Drag over each label to hide it. Every box is its own card; give boxes the same number to quiz them together.
        Drag a box to move it, its corner to resize, Delete to remove.
      </p>
      <div
        ref={area}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative w-fit max-w-full mx-auto select-none touch-none cursor-crosshair"
      >
        {url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" draggable={false} className="block max-w-full max-h-[36rem] rounded-lg pointer-events-none" />
          : <div className="h-60 w-96 max-w-full rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />}
        {[...shapes, ...(preview ? [preview] : [])].map((s, i) => (
          <div
            key={i}
            data-shape={i < shapes.length ? i : undefined}
            className={`absolute rounded-sm border-2 flex items-start justify-start cursor-move ${
              i === selected ? 'bg-orange-400/80 border-indigo-600' : 'bg-orange-400/70 border-orange-500'
            }`}
            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }}
          >
            <span className="m-0.5 px-1 rounded bg-white/90 text-[10px] font-bold text-gray-800 leading-tight pointer-events-none">{s.ord + 1}</span>
            {i < shapes.length && (
              <span data-handle="1" className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-white border-2 border-indigo-600 cursor-nwse-resize" />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {sel ? (
          <>
            <label className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              Card
              <CardNumber
                key={selected}
                value={sel.ord + 1}
                onChange={n => setShapes(shapes.map((o, i) => i === selected ? { ...o, ord: n - 1 } : o))}
              />
            </label>
            <button
              type="button"
              onClick={() => { setShapes(shapes.filter((_, i) => i !== selected)); setSelected(null) }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              <Trash2 size={14} /> Remove box
            </button>
          </>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">{shapes.length ? `${shapes.length} box${shapes.length !== 1 ? 'es' : ''} → ${cardCount} card${cardCount !== 1 ? 's' : ''}` : 'No boxes yet'}</span>
        )}
        <span className="flex-1" />
        <button type="button" onClick={pick} disabled={busy} className="px-2.5 py-1 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
          Change image
        </button>
      </div>

      <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 text-sm">
        {([['hide_all', 'Hide all, guess one'], ['hide_one', 'Hide one, guess one']] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ ...value, mode })}
            className={`flex-1 py-2 font-medium transition-colors ${value.mode === mode ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 text-pretty">
        {value.mode === 'hide_all'
          ? 'While asking about one box, the others stay covered too, so they can’t give the answer away.'
          : 'Only the box being asked is covered; you can see the rest.'}
      </p>
    </div>
  )
}
