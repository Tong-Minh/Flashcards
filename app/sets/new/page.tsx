'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

export default function NewSet() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Please enter a set name.')
    setSaving(true)

    const { data, error: err } = await supabase
      .from('sets')
      .insert({ name: name.trim(), description: description.trim() || null, is_public: isPublic })
      .select()
      .single()

    if (err || !data) {
      setError('Failed to create set. Please try again.')
      setSaving(false)
      return
    }

    router.push(`/sets/${data.id}`)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">New Set</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Set name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Spanish Vocabulary"
            autoFocus
            className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Description <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will you be studying?"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsPublic(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="text-left">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {isPublic ? 'Public' : 'Private'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {isPublic ? 'Friends and anyone you share it with can study this' : 'Only visible to you'}
            </p>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${isPublic ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isPublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </button>

        {error && (
          <p className="text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Creating...' : 'Create Set'}
        </button>
      </form>
    </div>
  )
}
