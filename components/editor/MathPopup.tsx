'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { renderMath } from '@/components/ContentRenderer'

// Fixed-position LaTeX editor, portalled to <body> so it sits outside the ProseMirror DOM
// (the editor never sees its keystrokes) and isn't clipped by overflow containers.
export function MathPopup({ initial, display, anchor, onCommit, onCancel }: {
  initial: string
  display: boolean
  anchor: DOMRect
  onCommit: (latex: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  const doneRef  = useRef(false)

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  function finish(commit: boolean) {
    if (doneRef.current) return
    doneRef.current = true
    if (commit) onCommit(value)
    else onCancel()
  }

  const width = 256
  const left  = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))
  const below = anchor.bottom + 6
  const top   = below + 140 > window.innerHeight ? Math.max(8, anchor.top - 146) : below
  const preview = value.trim() ? renderMath(value, display) : ''

  return createPortal(
    <div
      className="fixed z-[100] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-3"
      style={{ top, left, width }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-1.5">{display ? 'Display LaTeX' : 'LaTeX'}</p>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); finish(true) }
          if (e.key === 'Escape') { e.preventDefault(); finish(false) }
        }}
        onBlur={() => finish(true)}
        className="w-full font-mono text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
        spellCheck={false}
        placeholder="E = mc^2"
      />
      {preview && (
        <div
          className={`overflow-x-auto text-gray-900 dark:text-gray-100${display ? ' text-center py-1' : ''}`}
          dangerouslySetInnerHTML={{ __html: preview }}
        />
      )}
    </div>,
    document.body,
  )
}
