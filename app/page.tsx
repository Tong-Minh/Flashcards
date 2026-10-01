'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/components/AuthGuard'
import { getCachedSets, getCachedCollections, cacheSets, cacheCollections } from '@/lib/storage'
import { loadSetsAndCollections, type SetWithStats } from '@/lib/sets'
import { SetOrganizer } from '@/components/SetOrganizer'
import FriendsTab from '@/components/FriendsTab'
import DiscoverTab from '@/components/DiscoverTab'
import { SearchBar } from '@/components/SearchBar'
import { AppMenu } from '@/components/AppMenu'
import { itemMatcher } from '@/lib/search'
import { NewMenu } from '@/components/NewMenu'
import { IS_DESKTOP } from '@/lib/platform'
import type { Collection } from '@/lib/types'
import { BarChart3 } from 'lucide-react'
import { APP_VERSION } from '@/lib/changelog'

type Tab = 'mine' | 'discover' | 'friends'

// useSearchParams needs a Suspense boundary to build
export default function Home() {
  return <Suspense fallback={null}><HomePage /></Suspense>
}

function HomePage() {
  const currentUser = useUser()
  const router      = useRouter()
  const params      = useSearchParams()
  // The tab lives in the URL so the desktop sidebar can link to it
  const tabParam    = params.get('tab')
  // The desktop app only has your own library
  const tab: Tab    = !IS_DESKTOP && (tabParam === 'discover' || tabParam === 'friends') ? tabParam : 'mine'
  const setTab      = (t: Tab) => router.replace(t === 'mine' ? '/' : `/?tab=${t}`, { scroll: false })
  const [sets,        setSets]        = useState<SetWithStats[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading,     setLoading]     = useState(true)
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
  const { searching, tagQuery, matches } = itemMatcher(search)
  // Searching, or the Sets filter, lists every matching set flat (even ones inside collections);
  // otherwise collections come first and only ungrouped sets are listed below them.
  const flat      = searching || kind === 'sets'
  const visibleCollections = kind === 'sets' ? [] : searching ? collections.filter(matches) : collections
  const visibleSets = kind === 'collections' ? []
    : flat ? sets.filter(matches)
    : sets.filter(s => !s.collection_id || !collectionIds.has(s.collection_id))

  const TAB_LABELS: Record<Tab, string> = {
    mine:     'Library',
    discover: 'Discover',
    friends:  'Friends',
  }

  return (
    <div className="max-w-lg lg:max-w-6xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      {/* Header. On desktop the sidebar has the app name, tabs and the ⋯ menu, so the heading is the tab */}
      <div className="flex items-center justify-between mb-5 lg:mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 lg:hidden">Flashcards</h1>
        <h1 className="hidden lg:block text-2xl font-bold text-gray-900 dark:text-gray-100">{TAB_LABELS[tab]}</h1>
        <div className="flex items-center gap-2">
          {/* Phones have no sidebar, so Stats lives here */}
          <Link
            href="/stats"
            className="lg:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Stats"
            title="Stats"
          >
            <BarChart3 size={20} />
          </Link>
          {tab === 'mine' && <NewMenu />}
          {/* Everything else (settings, export/import, theme, sign out): the sidebar has its own on desktop */}
          <span className="lg:hidden"><AppMenu /></span>
        </div>
      </div>

      {/* Tab bar */}
      <div className={`flex border-b border-gray-200 dark:border-gray-700 mb-5 lg:hidden ${IS_DESKTOP ? 'hidden' : ''}`}>
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

      {/* ── Library ─────────────────────────────────────────────────────── */}
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
              label={flat ? 'Sets' : visibleCollections.length > 0 ? 'My Sets' : 'Sets'}
              collectionsLabel="Collections"
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

      {/* Phones have no sidebar, so the version history is linked here */}
      <Link href="/changelog" className="lg:hidden block text-center text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mt-10">
        Version {APP_VERSION} · What’s new
      </Link>
    </div>
  )
}
