'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { ItemIcon } from '@/components/ItemIcon'
import { SearchBar } from '@/components/SearchBar'

const PAGE_SIZE = 30

interface PublicSet {
  id: string
  name: string
  description: string | null
  tags: string[]
  icon: string | null
  color: string | null
  created_at: string
  user_id: string | null
  owner_name: string | null
  owner_avatar: string | null
  card_count: number
}

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
            <Link
              key={set.id}
              href={`/sets/${set.id}`}
              className="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
            >
              <ItemIcon icon={set.icon} color={set.color} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-snug">{set.name}</p>
                  <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-full px-2.5 py-1 font-medium">
                    {set.card_count} card{set.card_count !== 1 ? 's' : ''}
                  </span>
                </div>
                {set.description && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2">{set.description}</p>
                )}
                {set.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {set.tags.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setQuery(`#${t}`) }}
                        className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2.5">
                  {set.owner_avatar ? (
                    <img src={set.owner_avatar} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs font-bold">
                      {(set.owner_name ?? '?')[0].toUpperCase()}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500">{set.owner_name ?? 'Unknown'}</p>
                </div>
              </div>
            </Link>
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
