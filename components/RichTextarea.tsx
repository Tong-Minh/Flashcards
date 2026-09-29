'use client'

import { useRef, useState } from 'react'
import { ContentRenderer, hasCodeBlock } from '@/components/ContentRenderer'

interface Props {
  value: string
  onChange: (val: string) => void
  rows?: number
  placeholder?: string
  className?: string
}

const CODE_TEMPLATE = '```\n\n```'
const CURSOR_OFFSET  = 4   // place cursor inside the block: after "```\n"

export function RichTextarea({ value, onChange, rows = 3, placeholder, className }: Props) {
  const ref       = useRef<HTMLTextAreaElement>(null)
  const [show,    setShow]    = useState(false)
  const [slashAt, setSlashAt] = useState(-1)

  const hasCode = hasCodeBlock(value)

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    const pos = e.target.selectionStart ?? val.length
    onChange(val)

    if (val[pos - 1] === '/') {
      const lineStart   = val.lastIndexOf('\n', pos - 2) + 1
      const beforeSlash = val.slice(lineStart, pos - 1)
      if (beforeSlash.trim() === '') {
        setSlashAt(pos - 1)
        setShow(true)
        return
      }
    }
    setShow(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!show) return
    if (e.key === 'Escape') { e.preventDefault(); setShow(false) }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insert() }
  }

  function insert() {
    if (slashAt < 0) return
    const before = value.slice(0, slashAt)
    const after  = value.slice(slashAt + 1)
    const next   = before + CODE_TEMPLATE + after
    onChange(next)
    setShow(false)
    const cursor = before.length + CURSOR_OFFSET
    setTimeout(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(cursor, cursor)
    }, 0)
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />

      {/* Slash menu */}
      {show && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); insert() }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
          >
            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-mono text-gray-600 dark:text-gray-300">
              {'</>'}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Code block</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Syntax-highlighted, scrollable</p>
            </div>
            <span className="ml-auto text-xs text-gray-300 dark:text-gray-600 font-mono">↵</span>
          </button>
        </div>
      )}

      {/* Hint */}
      <p className="mt-1 text-xs text-gray-300 dark:text-gray-600 select-none">
        Type <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">/</span> on a new line to insert a code block
      </p>

      {/* Live preview — only shown when code blocks are present */}
      {hasCode && (
        <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-600 flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-gray-400 flex-shrink-0">
              <circle cx="5" cy="5" r="4.5" stroke="currentColor"/>
              <path d="M5 4v3M5 2.5v.5" stroke="currentColor" strokeLinecap="round"/>
            </svg>
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">Preview — this is how it appears during study</span>
          </div>
          <div className="px-4 py-3 bg-white dark:bg-gray-800">
            <ContentRenderer
              text={value}
              className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  )
}
