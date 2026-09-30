'use client'

import { useState } from 'react'
import { normalizeTag } from '@/lib/sets'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
}

export function TagList({ tags, className = '' }: { tags: string[] | null | undefined; className?: string }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map(t => (
        <span key={t} className="text-xs text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
          #{t}
        </span>
      ))}
    </div>
  )
}

export function TagInput({ value, onChange, suggestions = [] }: Props) {
  const [draft, setDraft] = useState('')

  function add(raw: string) {
    const tag = normalizeTag(raw)
    if (tag && !value.includes(tag)) onChange([...value, tag])
    setDraft('')
  }

  const matching = draft.trim()
    ? suggestions.filter(s => s.includes(normalizeTag(draft)) && !value.includes(s)).slice(0, 5)
    : []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent">
        {value.map(t => (
          <span key={t} className="flex items-center gap-1 text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 pl-2 pr-1 py-1 rounded-full">
            #{t}
            <button
              type="button"
              onClick={() => onChange(value.filter(v => v !== t))}
              className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-800 leading-none"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => {
            const v = e.target.value
            if (v.endsWith(',')) add(v.slice(0, -1))
            else setDraft(v)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); add(draft) }
            else if (e.key === 'Backspace' && !draft && value.length > 0) onChange(value.slice(0, -1))
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length === 0 ? 'Add tags (Enter or comma)' : ''}
          className="flex-1 min-w-[8rem] py-1 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-transparent outline-none"
        />
      </div>
      {matching.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {matching.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={e => { e.preventDefault(); add(s) }}
              className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 px-2 py-0.5 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              + #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
