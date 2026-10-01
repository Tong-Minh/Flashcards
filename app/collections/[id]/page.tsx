'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRouteIds } from '@/lib/useRouteIds'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { store } from '@/lib/store'
import { useUser } from '@/components/AuthGuard'
import { getCachedSets, getCachedCollections, cacheSets, cacheCollections } from '@/lib/storage'
import { loadSetsAndCollections, type SetWithStats } from '@/lib/sets'
import { SetOrganizer } from '@/components/SetOrganizer'
import { TagInput } from '@/components/TagInput'
import { IconPicker } from '@/components/IconPicker'
import { ShareButton } from '@/components/ShareButton'
import { DetailHeader, SettingsButton } from '@/components/DetailHeader'
import { PublicSetCard, type PublicSet } from '@/components/PublicSetCard'
import type { Collection } from '@/lib/types'
import { IS_DESKTOP } from '@/lib/platform'
import { confirmAction } from '@/lib/dialogs'
import { SourceUrlField, sourceUrlError } from '@/components/SourceUrlField'
import { normalizeUrl } from '@/lib/links'
import { itemMatcher } from '@/lib/search'
import { formatBytes } from '@/lib/media'
import { SearchBar } from '@/components/SearchBar'

export default function CollectionDetail() {
  const { id } = useRouteIds()
  const router = useRouter()
  const currentUser = useUser()

  const [collection,  setCollection]  = useState<Collection | null>(null)
  const [allSets,     setAllSets]     = useState<SetWithStats[]>([])
  const [ownCollections, setOwnCollections] = useState<Collection[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showPicker,  setShowPicker]  = useState(false)
  const [busySetId,   setBusySetId]   = useState<string | null>(null)
  const [search,      setSearch]      = useState('')
  const [size,        setSize]        = useState<number | null>(null)
  const { searching, matches } = itemMatcher(search)

  // Settings modal
  const [showSettings, setShowSettings] = useState(false)
  const [nameInput,    setNameInput]    = useState('')
  const [descInput,    setDescInput]    = useState('')
  const [sourceInput,  setSourceInput]  = useState('')
  const [sourceError,  setSourceError]  = useState<string | null>(null)
  const [tagsInput,    setTagsInput]    = useState<string[]>([])
  const [iconInput,    setIconInput]    = useState<{ icon: string | null; color: string | null }>({ icon: null, color: null })
  const [isPublicInput, setIsPublicInput] = useState(false)

  // Someone else's shared collection: read-only list of its public sets
  const [publicSets,   setPublicSets]   = useState<PublicSet[] | null>(null)
  const [ownerName,    setOwnerName]    = useState<string | null>(null)

  useEffect(() => { load() }, [id])

  function apply(sets: SetWithStats[], collections: Collection[]) {
    const c = collections.find(c => c.id === id) ?? null
    setAllSets(sets)
    setOwnCollections(collections)
    setCollection(c)
    if (c) {
      setNameInput(c.name)
      setDescInput(c.description ?? '')
      setSourceInput(c.source_url ?? '')
      setTagsInput(c.tags ?? [])
      setIconInput({ icon: c.icon ?? null, color: c.color ?? null })
      setIsPublicInput(c.is_public ?? false)
    }
    return c
  }

  async function load() {
    const cachedSets = getCachedSets() as SetWithStats[]
    if (apply(cachedSets, getCachedCollections())) setLoading(false)
    if (!navigator.onLine || !currentUser) { setLoading(false); return }
    const fresh = await loadSetsAndCollections(currentUser.id)
    if (!apply(fresh.sets, fresh.collections) && !(await loadShared())) { router.push('/'); return }
    setLoading(false)
  }

  // A collection shared by someone else. RLS only returns it (and its sets) if they're public.
  async function loadShared(): Promise<boolean> {
    const { data: c } = await supabase.from('collections').select('*').eq('id', id).maybeSingle()
    if (!c) return false
    const [setsRes, ownerRes] = await Promise.all([
      supabase.from('sets').select('id, name, description, tags, icon, color, flashcards(count)')
        .eq('collection_id', id).eq('is_public', true).order('position', { ascending: true, nullsFirst: true }).order('created_at', { ascending: false }),
      c.user_id ? supabase.from('profiles').select('display_name, avatar_url').eq('id', c.user_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const owner = ownerRes.data as { display_name: string | null; avatar_url: string | null } | null
    setCollection(c as Collection)
    setOwnerName(owner?.display_name ?? null)
    setPublicSets((setsRes.data ?? []).map(s => ({
      id: s.id, name: s.name, description: s.description, tags: s.tags ?? [], icon: s.icon, color: s.color,
      card_count: (s.flashcards as unknown as { count: number }[])?.[0]?.count ?? 0,
      owner_name: owner?.display_name ?? null, owner_avatar: owner?.avatar_url ?? null,
    })))
    return true
  }

  async function toggleMembership(set: SetWithStats) {
    const next = set.collection_id === id ? null : id
    setBusySetId(set.id)
    try {
      await store.updateSet(set.id, { collection_id: next })
    } catch {
      return
    } finally {
      setBusySetId(null)
    }
    const updated = allSets.map(s => (s.id === set.id ? { ...s, collection_id: next } : s))
    setAllSets(updated)
    cacheSets(updated)
  }

  async function saveInfo() {
    const name = nameInput.trim()
    if (!name || !collection) return
    const badSource = sourceUrlError(sourceInput)
    setSourceError(badSource)
    if (badSource) return
    const patch = { name, description: descInput.trim() || null, tags: tagsInput, icon: iconInput.icon, color: iconInput.color, is_public: isPublicInput, source_url: normalizeUrl(sourceInput) }
    try { await store.updateCollection(id, patch) } catch { return }
    const updated = { ...collection, ...patch }
    setCollection(updated)
    cacheCollections(getCachedCollections().map(c => (c.id === id ? updated : c)))
    setShowSettings(false)
  }

  async function deleteCollection() {
    if (!await confirmAction(`Delete the collection "${collection?.name}"? The sets inside it will be kept and moved out.`)) return
    await store.deleteCollection(id).catch(() => {})
    cacheCollections(getCachedCollections().filter(c => c.id !== id))
    cacheSets(allSets.map(s => (s.collection_id === id ? { ...s, collection_id: null } : s)))
    router.push('/')
  }

  // Desktop: how much space the collection's sets take (images and audio included)
  const setIdsKey = allSets.filter(s => s.collection_id === id).map(s => s.id).join(',')
  useEffect(() => {
    if (!IS_DESKTOP || !setIdsKey) { setSize(null); return }
    let alive = true
    store.getStorage(setIdsKey.split(',')).then(r => { if (alive) setSize(r.sets.reduce((n, s) => n + s.data + s.media, 0)) }).catch(() => {})
    return () => { alive = false }
  }, [setIdsKey])

  if (loading && !collection) {
    return <div className="max-w-lg lg:max-w-6xl mx-auto px-4 py-6 lg:px-8 lg:py-8 text-center text-gray-400 dark:text-gray-500 py-16">Loading…</div>
  }

  if (publicSets && collection) {
    return (
      <div className="max-w-lg lg:max-w-6xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
        <DetailHeader
          kind="collection"
          backHref="/"
          owner={ownerName}
          icon={collection.icon}
          color={collection.color}
          name={collection.name}
          description={collection.description}
          tags={collection.tags}
          sourceUrl={collection.source_url}
          actions={<ShareButton kind="collection" id={id} name={collection.name} isPublic isOwner={false} />}
        />

        {publicSets.length > 0 && (
          <SearchBar value={search} onChange={setSearch} placeholder="Search sets in this collection, or #tag" className="mb-3 lg:max-w-md" />
        )}
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {publicSets.length} set{publicSets.length !== 1 ? 's' : ''}
        </h2>
        {searching && !publicSets.some(matches) ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">Nothing matches &ldquo;{search.trim()}&rdquo;</p>
        ) : publicSets.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
            No public sets in this collection yet
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {publicSets.filter(matches).map(s => <PublicSetCard key={s.id} set={s} />)}
          </div>
        )}
        <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-4">Open a set to study it or save your own copy</p>
      </div>
    )
  }

  const sets       = allSets.filter(s => s.collection_id === id)
  const totalCards = sets.reduce((n, s) => n + s.totalCards, 0)
  const toStudy    = sets.reduce((n, s) => n + s.toStudy, 0)
  const tagSuggestions = Array.from(new Set(allSets.flatMap(s => s.tags ?? []))).sort()

  return (
    <div className="max-w-lg lg:max-w-6xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <DetailHeader
        kind="collection"
        backHref="/"
        icon={collection?.icon}
        color={collection?.color}
        name={collection?.name}
        description={collection?.description}
        tags={collection?.tags}
        sourceUrl={collection?.source_url}
        badge={collection?.is_public && (
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full">Shared</span>
        )}
        actions={<>
          {collection && (
            <ShareButton
              kind="collection"
              id={id}
              name={collection.name}
              isPublic={collection.is_public}
              isOwner
              privateSetCount={sets.filter(s => !s.is_public).length}
              onMadePublic={() => {
                const updated = { ...collection, is_public: true }
                setCollection(updated)
                setIsPublicInput(true)
                cacheCollections(getCachedCollections().map(c => (c.id === id ? updated : c)))
              }}
            />
          )}
          <SettingsButton onClick={() => setShowSettings(true)} />
        </>}
      />

      {/* Stats (and, in the desktop app, the space it takes) */}
      <div className={`grid ${size !== null ? 'grid-cols-4' : 'grid-cols-3'} gap-2 mb-5 lg:max-w-md`}>
        {[
          { value: sets.length, label: 'Sets'     },
          { value: totalCards,  label: 'Cards'    },
          { value: toStudy,     label: 'To study' },
          ...(size !== null ? [{ value: formatBytes(size), label: 'Size' }] : []),
        ].map(({ value, label }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-2.5 text-center shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="text-base font-bold text-gray-900 dark:text-gray-100">{value}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {sets.length > 0 && (
        <SearchBar value={search} onChange={setSearch} placeholder="Search sets in this collection, or #tag" className="mb-4 lg:max-w-md" />
      )}

      <SetOrganizer
        title={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Sets</h2>}
        actions={<>
          <button
            onClick={() => setShowPicker(true)}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium px-2 py-1.5"
          >
            Add existing
          </button>
          <Link
            href={`/sets/new?collection=${id}`}
            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
          >
            + New set
          </Link>
        </>}
        allSets={allSets}
        onSetsChange={next => { setAllSets(next); cacheSets(next) }}
        collections={ownCollections}
        onCollectionsChange={next => { setOwnCollections(next); cacheCollections(next) }}
        listSets={sets.filter(matches)}
        // Reordering while some sets are hidden would scramble the order
        sortable={!searching}
        currentCollectionId={id}
        empty={searching ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">Nothing matches &ldquo;{search.trim()}&rdquo;</p>
        ) : (
          <div className="text-center text-gray-400 dark:text-gray-500 py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
            <p className="mb-1">No sets in this collection</p>
            <p className="text-sm">Create a new set or add existing ones</p>
          </div>
        )}
      />

      {/* ── Set picker ────────────────────────────────────────────────────── */}
      {showPicker && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowPicker(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
            <div className="w-full max-w-sm max-h-[80vh] flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-xl pointer-events-auto">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Sets in collection</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500">A set can be in one collection at a time</p>
                </div>
                <button
                  onClick={() => setShowPicker(false)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors text-xl leading-none"
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto px-3 pb-4">
                {allSets.length === 0 && (
                  <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-6">You don&apos;t have any sets yet</p>
                )}
                {allSets.map(s => {
                  const inThis  = s.collection_id === id
                  const otherName = !inThis && s.collection_id
                    ? getCachedCollections().find(c => c.id === s.collection_id)?.name
                    : null
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleMembership(s)}
                      disabled={busySetId === s.id}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50"
                    >
                      <span className={`w-5 h-5 flex-shrink-0 rounded-md border-2 flex items-center justify-center text-xs ${
                        inThis ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {inThis && '✓'}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.name}</span>
                        <span className="block text-xs text-gray-400 dark:text-gray-500">
                          {s.totalCards} cards{otherName ? ` · in ${otherName}` : ''}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Settings modal ────────────────────────────────────────────────── */}
      {showSettings && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowSettings(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
            <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl pointer-events-auto">
              <div className="px-5 pt-5 pb-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Collection settings</h2>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors text-xl leading-none"
                  >
                    ×
                  </button>
                </div>

                <div className="mb-5 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name</label>
                    <div className="flex items-center gap-3">
                      <IconPicker icon={iconInput.icon} color={iconInput.color} kind="collection" onChange={setIconInput} />
                      <input
                        value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                    <textarea
                      value={descInput}
                      onChange={e => setDescInput(e.target.value)}
                      rows={2}
                      placeholder="Optional"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                  <SourceUrlField value={sourceInput} onChange={v => { setSourceInput(v); setSourceError(null) }} error={sourceError} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tags</label>
                    <TagInput value={tagsInput} onChange={setTagsInput} suggestions={tagSuggestions} />
                  </div>
                  {/* Sharing is web-only */}
                  {!IS_DESKTOP && (
                    <button
                      type="button"
                      onClick={() => setIsPublicInput(v => !v)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600/50 transition-colors"
                    >
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{isPublicInput ? 'Shared' : 'Private'}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {isPublicInput ? 'Anyone with the link can see its public sets' : 'Only visible to you'}
                        </p>
                      </div>
                      <div className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${isPublicInput ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPublicInput ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                    </button>
                  )}
                </div>

                <button
                  onClick={saveInfo}
                  className="w-full py-2 mb-5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  Save
                </button>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={deleteCollection}
                    className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-100 dark:border-red-800"
                  >
                    Delete collection
                  </button>
                  <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-2">Sets inside are kept, not deleted</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
