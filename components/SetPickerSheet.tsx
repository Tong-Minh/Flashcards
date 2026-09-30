'use client'

import { useState } from 'react'
import { ItemIcon } from '@/components/ItemIcon'
import { SearchBar } from '@/components/SearchBar'
import type { FlashcardSet } from '@/lib/types'

// Bottom sheet for choosing a set to move cards into
export function SetPickerSheet({ title, sets, onPick, onClose }: {
  title: string
  sets: (FlashcardSet & { totalCards?: number })[]
  onPick: (setId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? sets.filter(s => s.name.toLowerCase().includes(q)) : sets

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        {sets.length > 6 && (
          <div className="px-4 pb-2">
            <SearchBar value={query} onChange={setQuery} placeholder="Find a set" />
          </div>
        )}
        <div className="overflow-y-auto px-2 pb-4">
          {shown.length === 0 && (
            <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-6">
              {sets.length === 0 ? 'You have no other sets' : 'No sets match'}
            </p>
          )}
          {shown.map(s => (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <ItemIcon icon={s.icon} color={s.color} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.name}</span>
                {s.totalCards !== undefined && (
                  <span className="block text-xs text-gray-400 dark:text-gray-500">{s.totalCards} card{s.totalCards !== 1 ? 's' : ''}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
