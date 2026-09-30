'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { store } from '@/lib/store'
import { getCachedSets, getCachedCollections, cacheCollections } from '@/lib/storage'
import type { Collection } from '@/lib/types'
import { TagInput } from '@/components/TagInput'
import { IconPicker } from '@/components/IconPicker'
import { suggestIcon } from '@/lib/icons'

export default function NewCollection() {
  const router = useRouter()
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [tags,        setTags]        = useState<string[]>([])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [icon,        setIcon]        = useState<string | null>(null)
  const [color,       setColor]       = useState<string | null>(null)
  // Until the user picks an icon themselves, it follows the name
  const [iconPicked,  setIconPicked]  = useState(false)

  const tagSuggestions = Array.from(new Set([
    ...getCachedSets().flatMap(s => s.tags ?? []),
    ...getCachedCollections().flatMap(c => c.tags ?? []),
  ])).sort()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Please enter a collection name.')
    setSaving(true)

    let created: Collection
    try {
      created = await store.createCollection({ name: name.trim(), description: description.trim() || null, tags, icon, color })
    } catch {
      setError('Failed to create collection. Please try again.')
      setSaving(false)
      return
    }

    cacheCollections([...getCachedCollections(), created].sort((a, b) => a.name.localeCompare(b.name)))
    router.push(`/collections/${created.id}`)
  }

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">New Collection</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Collection name</label>
          <div className="flex items-center gap-3">
            <IconPicker
              icon={icon}
              color={color}
              kind="collection"
              onChange={next => { setIcon(next.icon); setColor(next.color); setIconPicked(true) }}
            />
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!iconPicked) setIcon(suggestIcon(e.target.value))
              }}
              placeholder="e.g. Biology 101"
              autoFocus
              className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Description <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What sets go in here?"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Tags <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
          </label>
          <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
        </div>

        {error && (
          <p className="text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Creating...' : 'Create Collection'}
        </button>
      </form>
    </div>
  )
}
