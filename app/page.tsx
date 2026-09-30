'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useUser } from '@/components/AuthGuard'
import { useDarkMode } from '@/components/ThemeProvider'
import { getCachedSets, getCachedCollections, cacheSets, cacheCollections } from '@/lib/storage'
import { loadSetsAndCollections, type SetWithStats } from '@/lib/sets'
import { SetOrganizer } from '@/components/SetOrganizer'
import FriendsTab from '@/components/FriendsTab'
import DiscoverTab from '@/components/DiscoverTab'
import { SearchBar } from '@/components/SearchBar'
import type { Collection } from '@/lib/types'

async function signOut() {
  await supabase.auth.signOut()
}

type Tab = 'mine' | 'discover' | 'friends'

// useSearchParams needs a Suspense boundary to build
export default function Home() {
  return <Suspense fallback={null}><HomePage /></Suspense>
}

function HomePage() {
  const currentUser = useUser()
  const { theme, toggle } = useDarkMode()
  const router      = useRouter()
  const params      = useSearchParams()
  // The tab lives in the URL so the desktop sidebar can link to it
  const tabParam    = params.get('tab')
  const tab: Tab    = tabParam === 'discover' || tabParam === 'friends' ? tabParam : 'mine'
  const setTab      = (t: Tab) => router.replace(t === 'mine' ? '/' : `/?tab=${t}`, { scroll: false })
  const [sets,        setSets]        = useState<SetWithStats[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [kind,        setKind]        = useState<'all' | 'collections' | 'sets'>('all')
  const [search,      setSearch]      = useState('')

  useEffect(() => {
    const cached = getCachedSets()
    if (cached.length > 0) {
      setSets(cached as SetWithStats[])
      setCollections(getCachedCollections())
      setLoading(false)
    }
    loadSets()
  }, [])

  async function loadSets() {
    if (!navigator.onLine || !currentUser) { setLoading(false); return }
    try {
      const fresh = await loadSetsAndCollections(currentUser.id)
      setSets(fresh.sets)
      setCollections(fresh.collections)
    } catch (err) {
      console.error('Failed to refresh sets', err)
    } finally {
      setLoading(false)
    }
  }

  const setsByCollection = useMemo(() => {
    const map: Record<string, SetWithStats[]> = {}
    for (const s of sets) if (s.collection_id) (map[s.collection_id] ??= []).push(s)
    return map
  }, [sets])

  const collectionIds = new Set(collections.map(c => c.id))
  // "#bio" searches tags only (by prefix); anything else matches name, description, or tags
  const raw      = search.trim().toLowerCase()
  const tagQuery = raw.startsWith('#') ? raw.slice(1) : null
  const matches = (item: { name: string; description: string | null; tags: string[] | null }) =>
    tagQuery !== null
      ? !!item.tags?.some(t => t.startsWith(tagQuery))
      : !raw || item.name.toLowerCase().includes(raw) || !!item.description?.toLowerCase().includes(raw) || !!item.tags?.some(t => t.includes(raw))
  // Searching, or the Sets filter, lists every matching set flat (even ones inside collections);
  // otherwise collections come first and only ungrouped sets are listed below them.
  const searching = !!raw && raw !== '#'
  const flat      = searching || kind === 'sets'
  const visibleCollections = kind === 'sets' ? [] : searching ? collections.filter(matches) : collections
  const visibleSets = kind === 'collections' ? []
    : flat ? sets.filter(matches)
    : sets.filter(s => !s.collection_id || !collectionIds.has(s.collection_id))

  const TAB_LABELS: Record<Tab, string> = {
    mine:     'My Sets',
    discover: 'Discover',
    friends:  'Friends',
  }

  return (
    <div className="max-w-lg lg:max-w-6xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      {/* Header. On desktop the sidebar has the app name, tabs, theme and sign out, so the heading is the tab */}
      <div className="flex items-center justify-between mb-5 lg:mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 lg:hidden">Flashcards</h1>
        <h1 className="hidden lg:block text-2xl font-bold text-gray-900 dark:text-gray-100">{TAB_LABELS[tab]}</h1>
        <div className="flex items-center gap-2">
          {tab === 'mine' && (
            <div className="relative">
              <button
                onClick={() => setShowNewMenu(v => !v)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
              >
                + New
              </button>
              {showNewMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowNewMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-20 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 overflow-hidden">
                    <Link href="/sets/new" className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">New set</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">A deck of cards to study</p>
                    </Link>
                    <Link href="/collections/new" className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">New collection</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">A folder to group sets together</p>
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={toggle}
            className="lg:hidden p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>
          <button
            onClick={signOut}
            className="lg:hidden p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            title="Sign out"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-5 lg:hidden">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              tab === t
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── My Sets ─────────────────────────────────────────────────────── */}
      {tab === 'mine' && (
        loading ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16">Loading...</div>
        ) : sets.length === 0 && collections.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16">
            <p className="text-4xl mb-3">📚</p>
            <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">No sets yet</p>
            <p className="text-sm">Create a set to start studying</p>
          </div>
        ) : (
          <>
            {/* Side by side on desktop */}
            <div className="lg:flex lg:items-center lg:gap-4 mb-4">
            <SearchBar value={search} onChange={setSearch} placeholder="Search sets and collections, or #tag" className="mb-3 lg:mb-0 lg:flex-1 lg:max-w-md" />

            <div className="flex gap-1.5">
              {(['all', 'collections', 'sets'] as const).map(k => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                    kind === k
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {k === 'all' ? 'All' : k === 'collections' ? `Collections · ${collections.length}` : `Sets · ${sets.length}`}
                </button>
              ))}
            </div>
            </div>

            <SetOrganizer
              allSets={sets}
              onSetsChange={next => { setSets(next); cacheSets(next) }}
              collections={collections}
              onCollectionsChange={next => { setCollections(next); cacheCollections(next) }}
              listSets={visibleSets}
              dropCollections={visibleCollections}
              setsByCollection={setsByCollection}
              sortable={!flat}
              label={flat ? 'Sets' : visibleCollections.length > 0 ? 'Ungrouped sets' : 'Sets'}
            />

            {visibleSets.length === 0 && visibleCollections.length === 0 && (
              <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">
                {searching
                  ? tagQuery !== null ? <>Nothing tagged #{tagQuery}</> : <>Nothing matches &ldquo;{search.trim()}&rdquo;</>
                  : kind === 'collections' ? 'No collections yet' : 'No sets yet'}
              </p>
            )}
          </>
        )
      )}

      {/* ── Discover ──────────────────────────────────────────────────── */}
      {tab === 'discover' && <DiscoverTab />}

      {/* ── Friends ─────────────────────────────────────────────────────── */}
      {tab === 'friends' && currentUser && (
        <div className="lg:max-w-2xl"><FriendsTab currentUser={currentUser} /></div>
      )}

    </div>
  )
}
