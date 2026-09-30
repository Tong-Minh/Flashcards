'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { PublicSetCard, type PublicSet } from '@/components/PublicSetCard'
import { SearchBar } from '@/components/SearchBar'

const PAGE_SIZE = 30

export default function DiscoverTab() {
  const [query,       setQuery]       = useState('')
  const [sets,        setSets]        = useState<PublicSet[]>([])
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore,     setHasMore]     = useState(false)
  const [error,       setError]       = useState(false)
  // Ignore responses from searches that have since been replaced
  const requestId = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => load(query, 0), query ? 300 : 0)
    return () => clearTimeout(t)
  }, [query])

  async function load(q: string, offset: number) {
    const req = ++requestId.current
    if (offset === 0) setLoading(true)
    else setLoadingMore(true)
    const { data, error: err } = await supabase.rpc('discover_sets', { q, lim: PAGE_SIZE, off: offset })
    if (req !== requestId.current) return
    setError(!!err)
    const rows = (data ?? []) as PublicSet[]
    setSets(prev => (offset === 0 ? rows : [...prev, ...rows]))
    setHasMore(rows.length === PAGE_SIZE)
    setLoading(false)
    setLoadingMore(false)
  }

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 px-4 pb-3 pt-1 bg-gray-50 dark:bg-gray-900">
        <SearchBar value={query} onChange={setQuery} placeholder="Search public sets by name or #tag" />
      </div>

      {loading ? (
        <div className="text-center text-gray-400 dark:text-gray-500 py-16 text-sm">Loading…</div>
      ) : error ? (
        <div className="text-center text-gray-400 dark:text-gray-500 py-16 text-sm">Couldn&apos;t load public sets. Check your connection.</div>
      ) : sets.length === 0 ? (
        <div className="text-center text-gray-400 dark:text-gray-500 py-16">
          <p className="text-3xl mb-3">🌐</p>
          {query.trim() ? (
            <p className="font-medium text-gray-500 dark:text-gray-400">No public sets match &ldquo;{query.trim()}&rdquo;</p>
          ) : (
            <>
              <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">Nothing here yet</p>
              <p className="text-sm">Public sets from other people will show up here</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sets.map(set => (
            <PublicSetCard key={set.id} set={set} onTagClick={t => setQuery(`#${t}`)} />
          ))}

          {hasMore && (
            <button
              onClick={() => load(query, sets.length)}
              disabled={loadingMore}
              className="w-full py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
