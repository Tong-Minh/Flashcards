'use client'

import { useState } from 'react'
import { ItemIcon } from '@/components/ItemIcon'
import type { Collection } from '@/lib/types'

// Bottom sheet for choosing where selected sets go: a collection, no collection, or a new one
export function MoveSheet({ count, collections, currentCollectionId, onPick, onCreate, onClose }: {
  count: number
  collections: Collection[]
  // Collection the sets are being viewed in (collection page), shown as current
  currentCollectionId?: string | null
  onPick: (collectionId: string | null) => void
  onCreate: (name: string) => Promise<void>
  onClose: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [newName,  setNewName]  = useState('')
  const [saving,   setSaving]   = useState(false)

  async function create() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try { await onCreate(name) } finally { setSaving(false) }
  }

  const row = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Move {count} set{count !== 1 ? 's' : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto px-2 pb-4">
          {creating ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false) }}
                placeholder="Collection name"
                className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500"
              />
              <button
                onClick={create}
                disabled={saving || !newName.trim()}
                className="px-3 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? '…' : 'Create'}
              </button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className={row}>
              <span className="w-10 h-10 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 text-xl">+</span>
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">New collection…</span>
            </button>
          )}

          {collections.map(c => (
            <button key={c.id} onClick={() => onPick(c.id)} disabled={c.id === currentCollectionId} className={row}>
              <ItemIcon icon={c.icon} color={c.color} kind="collection" />
              <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.name}</span>
              {c.id === currentCollectionId && <span className="text-xs text-gray-400 dark:text-gray-500">Current</span>}
            </button>
          ))}

          <button onClick={() => onPick(null)} className={row}>
            <span className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">No collection</span>
          </button>
        </div>
      </div>
    </div>
  )
}
