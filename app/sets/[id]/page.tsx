'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useUser } from '@/components/AuthGuard'
import {
  cacheCards, getCachedCards, getCachedSets,
  cacheSessions, getCachedSessions,
  getSetSettings, saveSetSettings,
  resetTodayNewCount, clearSavedSession,
  getCachedCollections, cacheSets,
} from '@/lib/storage'
import { fetchAllRows, MAX_CARDS_PER_SET } from '@/lib/fetchAll'
import { previewText, ContentRenderer, hasFormattedContent } from '@/components/ContentRenderer'
import { CardPreviewModal } from '@/components/CardPreview'
import { TagInput, TagList } from '@/components/TagInput'
import type { Collection, FlashcardSet, FlashcardWithProgress, StudySession } from '@/lib/types'

const PAGE_SIZE = 50

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  new:          { label: 'New',      className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'     },
  learning:     { label: 'Learning', className: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' },
  needs_review: { label: 'Review',   className: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' },
  mastered:     { label: 'Mature',   className: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'   },
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) {
    const h = date.getHours() % 12 || 12
    const m = date.getMinutes().toString().padStart(2, '0')
    const ampm = date.getHours() >= 12 ? 'pm' : 'am'
    return `Today ${h}:${m}${ampm}`
  }
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

// Compact version for narrow stat cells — omits time to avoid truncation
function compactDate(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

export default function SetDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const currentUser = useUser()

  const [set,      setSet]      = useState<FlashcardSet | null>(null)
  const [cards,    setCards]    = useState<FlashcardWithProgress[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'cards' | 'history'>('cards')
  const [forking,     setForking]     = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [page,         setPage]         = useState(0)
  const [previewCard,  setPreviewCard]  = useState<FlashcardWithProgress | null>(null)
  const [collections,  setCollections]  = useState<Collection[]>([])
  const cardsTopRef = useRef<HTMLDivElement>(null)

  // Settings sheet
  const [showSettings,      setShowSettings]      = useState(false)
  const [nameInput,         setNameInput]         = useState('')
  const [descInput,         setDescInput]         = useState('')
  const [isPublicInput,     setIsPublicInput]     = useState(true)
  const [dailyLimitInput,   setDailyLimitInput]   = useState(20)
  const [tagsInput,         setTagsInput]         = useState<string[]>([])
  const [collectionInput,   setCollectionInput]   = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const isOwner = !!currentUser && !!set && set.user_id === currentUser.id

  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    const cachedCards = getCachedCards(id)
    const cachedSets  = getCachedSets()
    const cachedSet   = cachedSets.find(s => s.id === id) ?? null
    const cachedSess  = getCachedSessions(id)

    if (cachedSet || cachedCards.length > 0) {
      if (cachedSet) {
        setSet(cachedSet)
        setNameInput(cachedSet.name)
        setDescInput(cachedSet.description ?? '')
        setIsPublicInput(cachedSet.is_public ?? false)
        setTagsInput(cachedSet.tags ?? [])
        setCollectionInput(cachedSet.collection_id ?? '')
      }
      if (cachedCards.length > 0) setCards(cachedCards)
      if (cachedSess.length  > 0) setSessions(cachedSess)
      setLoading(false)
    }

    setCollections(getCachedCollections())
    const settings = getSetSettings(id)
    setDailyLimitInput(settings.dailyNewLimit)

    if (!navigator.onLine) { setLoading(false); return }

    const [setRes, rawCards, sessionsRes, collectionsRes] = await Promise.all([
      supabase.from('sets').select('*').eq('id', id).single(),
      fetchAllRows<FlashcardWithProgress>(() => supabase
        .from('flashcards')
        .select('*, progress:card_progress(*)')
        .eq('set_id', id)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }), MAX_CARDS_PER_SET),
      supabase
        .from('study_sessions')
        .select('*')
        .eq('set_id', id)
        .order('completed_at', { ascending: false }),
      supabase.from('collections').select('*').order('name'),
    ])

    if (!setRes.data) { router.push('/'); return }

    const freshCards = rawCards.map((c) => ({
      ...c,
      progress: Array.isArray(c.progress) ? (c.progress[0] ?? null) : c.progress,
    }))
    const freshSessions = sessionsRes.data ?? []

    setSet(setRes.data)
    setNameInput(setRes.data.name)
    setDescInput(setRes.data.description ?? '')
    setIsPublicInput(setRes.data.is_public ?? false)
    setTagsInput(setRes.data.tags ?? [])
    setCollectionInput(setRes.data.collection_id ?? '')
    if (collectionsRes.data) setCollections(collectionsRes.data)
    setCards(freshCards)
    setSessions(freshSessions)
    cacheCards(id, freshCards)
    cacheSessions(id, freshSessions)
    setLoading(false)
  }

  async function saveInfo() {
    const trimmedName = nameInput.trim()
    const trimmedDesc = descInput.trim()
    if (!trimmedName) return
    const patch = {
      name: trimmedName,
      description: trimmedDesc || null,
      is_public: isPublicInput,
      tags: tagsInput,
      collection_id: collectionInput || null,
    }
    const { error } = await supabase.from('sets').update(patch).eq('id', id)
    if (error) return
    setSet(s => s ? { ...s, ...patch } : s)
    cacheSets(getCachedSets().map(s => (s.id === id ? { ...s, ...patch } : s)))
    setShowSettings(false)
  }

  async function forkSet() {
    setForking(true)
    try {
      const { data, error } = await supabase.rpc('fork_set', { original_set_id: id })
      if (!error && data) router.push(`/sets/${data}`)
    } finally {
      setForking(false)
    }
  }

  function saveDailyLimit(val: number) {
    const clamped = Math.max(1, Math.min(999, val || 1))
    setDailyLimitInput(clamped)
    saveSetSettings(id, { ...getSetSettings(id), dailyNewLimit: clamped })
  }

  async function resetProgress() {
    if (!confirm('Reset all FSRS progress for this set? Cards will return to New state.')) return
    // Chunked so the id list in the query string stays well under URL length limits
    const cardIds = cards.map(c => c.id)
    for (let i = 0; i < cardIds.length; i += 200) {
      await supabase.from('card_progress').delete().in('card_id', cardIds.slice(i, i + 200))
    }
    resetTodayNewCount(id)
    const reset = cards.map(c => ({ ...c, progress: null }))
    setCards(reset)
    cacheCards(id, reset)
    setShowSettings(false)
  }

  async function clearAllCards() {
    if (!confirm(`Delete all ${cards.length} cards in "${set?.name}"? The set, its settings, and its study history are kept. This can't be undone.`)) return
    // card_progress rows cascade-delete with their cards
    const { error } = await supabase.from('flashcards').delete().eq('set_id', id)
    if (error) { alert('Failed to clear cards. Please try again.'); return }
    resetTodayNewCount(id)
    clearSavedSession(id)
    setCards([])
    cacheCards(id, [])
    setPage(0)
    setShowSettings(false)
  }

  async function deleteSet() {
    if (!confirm(`Delete "${set?.name}" and all its cards?`)) return
    await supabase.from('sets').delete().eq('id', id)
    router.push('/')
  }

  async function reorderCard(index: number, dir: 'up' | 'down') {
    const other = dir === 'up' ? index - 1 : index + 1
    if (other < 0 || other >= cards.length) return
    const swapped = [...cards]
    ;[swapped[index], swapped[other]] = [swapped[other], swapped[index]]
    // Only write cards whose position actually changed (after the first reorder that's just the swapped pair)
    const changed = swapped.flatMap((c, i) => (c.position !== i ? [{ id: c.id, position: i }] : []))
    const newCards = swapped.map((c, i) => ({ ...c, position: i }))
    setCards(newCards)
    cacheCards(id, newCards)
    await Promise.all(
      changed.map(c => supabase.from('flashcards').update({ position: c.position }).eq('id', c.id))
    )
  }

  if (loading && !set) {
    return <div className="max-w-lg mx-auto px-4 py-6 text-center text-gray-400 dark:text-gray-500 py-16">Loading…</div>
  }

  const mastered    = cards.filter(c => c.progress?.status === 'mastered').length
  const masteryPct  = cards.length > 0 ? Math.round((mastered / cards.length) * 100) : 0
  const now         = new Date()
  const dueToday    = cards.filter(c => {
    const p = c.progress
    if (!p || (p.fsrs_state ?? 0) === 0) return true
    return new Date(p.due ?? now) <= now
  }).length

  const setCollection = set?.collection_id ? collections.find(c => c.id === set.collection_id) ?? null : null
  const atCardLimit   = cards.length >= MAX_CARDS_PER_SET
  const pageCount     = Math.max(1, Math.ceil(cards.length / PAGE_SIZE))
  const safePage      = Math.min(page, pageCount - 1)
  const pageStart     = safePage * PAGE_SIZE
  const pageCards     = cards.slice(pageStart, pageStart + PAGE_SIZE)

  function closePreview() { setPreviewCard(null) }

  function goToPage(p: number) {
    setPage(p)
    cardsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const lastStudied  = sessions[0]?.completed_at ?? null
  const totalSessions = sessions.length
  const avgCorrect   =
    sessions.length > 0
      ? Math.round(
          (sessions.reduce((s, x) => s + x.correct_count, 0) /
            sessions.reduce((s, x) => s + Math.max(x.cards_studied, 1), 0)) * 100
        )
      : null

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <Link href={setCollection ? `/collections/${setCollection.id}` : '/'} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors flex-shrink-0 mt-1">←</Link>
        <div className="flex-1 min-w-0">
          {setCollection && (
            <Link href={`/collections/${setCollection.id}`} className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide hover:underline">
              {setCollection.name}
            </Link>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{set?.name}</h1>
            {set && !set.is_public && (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                Private
              </span>
            )}
          </div>
          {set?.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{set.description}</p>
          )}
          <TagList tags={set?.tags} className="mt-2" />
        </div>
        {isOwner && (
          <button
            onClick={() => setShowSettings(true)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1 mt-0.5"
            aria-label="Settings"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { value: cards.length,        label: 'Cards'    },
          { value: `${masteryPct}%`,    label: 'Mature'   },
          { value: totalSessions,       label: 'Sessions' },
          { value: compactDate(lastStudied), label: 'Last'    },
        ].map(({ value, label }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-2.5 text-center shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">{value}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Accuracy banner */}
      {avgCorrect !== null && (
        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-indigo-700 dark:text-indigo-300">Avg accuracy</span>
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{avgCorrect}%</span>
        </div>
      )}

      {/* Mastery bar */}
      {cards.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
            <span>{mastered} mature</span>
            <span>{cards.length - mastered} remaining</span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${masteryPct}%` }} />
          </div>
        </div>
      )}

      {/* Study CTA */}
      <div className="flex gap-3 mb-5">
        {cards.length > 0 ? (
          <Link
            href={`/sets/${id}/study`}
            className="flex-1 block text-center bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
          >
            {dueToday > 0 ? `Study — ${dueToday} due` : 'Study'}
          </Link>
        ) : (
          <button
            disabled
            className="flex-1 text-center bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg opacity-40 cursor-not-allowed shadow-sm"
          >
            Study
          </button>
        )}
        {cards.length > 0 && (
          <Link
            href={`/sets/${id}/study?mode=view`}
            title="Flip through every card without affecting stats or scheduling"
            className="flex items-center gap-1.5 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            View
          </Link>
        )}
        {!isOwner && (
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              className="h-full px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shadow-sm text-xl leading-none tracking-widest"
              aria-label="More options"
            >
              •••
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-20 w-52 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 overflow-hidden">
                  <button
                    onClick={() => { setShowMoreMenu(false); forkSet() }}
                    disabled={forking}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50"
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{forking ? 'Duplicating…' : 'Duplicate set'}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Save your own copy to study &amp; edit</p>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {dueToday === 0 && cards.length > 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl text-center text-sm font-medium mb-5 -mt-3">
          All caught up — no cards due
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        {(['cards', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors capitalize ${
              tab === t
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
            }`}
          >
            {t === 'history' ? `History${sessions.length > 0 ? ` (${sessions.length})` : ''}` : 'Cards'}
          </button>
        ))}
      </div>

      {/* ── Cards tab ─────────────────────────────────────────────────────── */}
      {tab === 'cards' && (
        <>
          <div ref={cardsTopRef} className="flex items-center justify-between mb-3 scroll-mt-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {cards.length} card{cards.length !== 1 ? 's' : ''}
            </h2>
            {isOwner && atCardLimit && (
              <span className="text-xs text-gray-400 dark:text-gray-500">Limit of {MAX_CARDS_PER_SET.toLocaleString()} reached</span>
            )}
            {isOwner && !atCardLimit && (
              <div className="flex items-center gap-2">
                <Link
                  href={`/sets/${id}/import`}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium px-3 py-1.5"
                >
                  Import
                </Link>
                <Link
                  href={`/sets/${id}/create`}
                  className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                >
                  + Add
                </Link>
              </div>
            )}
          </div>

          {cards.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <p className="mb-1">No cards yet</p>
              <p className="text-sm">Add cards or import a list</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pageCards.map((card, pageIdx) => {
                const idx    = pageStart + pageIdx
                const status = card.progress?.status ?? 'new'
                const badge  = STATUS_STYLES[status]
                return (
                  <div
                    key={card.id}
                    onClick={e => {
                      // Edit / reorder controls and links inside content keep their own behavior
                      if ((e.target as HTMLElement).closest('a, button')) return
                      setPreviewCard(card)
                    }}
                    className="bg-white dark:bg-gray-800 rounded-xl p-3.5 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Number in its own column so formatted (block-level) questions start on the same line as plain ones */}
                        <div className="flex gap-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <span className="flex-shrink-0 text-gray-400 dark:text-gray-500">{idx + 1}.</span>
                          <div className="flex-1 min-w-0 [&_:is(h1,h2,h3):first-child]:mt-0">
                            {hasFormattedContent(card.question)
                              ? <ContentRenderer text={card.question} readOnly className="text-sm font-medium text-gray-900 dark:text-gray-100" />
                              : previewText(card.question)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {card.type === 'multiple_choice' ? 'MC' : card.type === 'fill_blank' ? 'FB' : 'OE'}
                          </span>
                        </div>
                      </div>
                      {isOwner && (
                        <div className="flex items-stretch gap-3 flex-shrink-0">
                          <Link
                            href={`/sets/${id}/edit/${card.id}`}
                            className="flex items-center px-2.5 text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            Edit
                          </Link>
                          <div className="flex flex-col rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden w-7">
                            <button
                              onClick={() => reorderCard(idx, 'up')}
                              disabled={idx === 0}
                              className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-20 transition-colors border-b border-gray-200 dark:border-gray-600"
                            >
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M4 1L7 6H1L4 1Z"/></svg>
                            </button>
                            <button
                              onClick={() => reorderCard(idx, 'down')}
                              disabled={idx === cards.length - 1}
                              className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-20 transition-colors"
                            >
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M4 7L1 2H7L4 7Z"/></svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                      {card.type === 'multiple_choice' && card.options ? (
                        <ul className="space-y-1">
                          {card.options.map(opt => (
                            <li
                              key={opt}
                              className={`text-xs px-2 py-1 rounded-lg ${
                                opt === card.answer
                                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              {opt === card.answer ? '✓ ' : ''}
                              {hasFormattedContent(opt)
                                ? <ContentRenderer text={opt} readOnly className="inline-block text-xs" />
                                : opt}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        hasFormattedContent(card.answer)
                          ? <div className="text-xs text-gray-600 dark:text-gray-400"><ContentRenderer text={card.answer} readOnly /></div>
                          : <p className="text-xs text-gray-600 dark:text-gray-400">{previewText(card.answer)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 mt-4">
              <button
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage === 0}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <select
                value={safePage}
                onChange={e => goToPage(Number(e.target.value))}
                className="text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 outline-none"
                aria-label="Page"
              >
                {Array.from({ length: pageCount }, (_, i) => (
                  <option key={i} value={i}>
                    {i * PAGE_SIZE + 1}–{Math.min((i + 1) * PAGE_SIZE, cards.length)} of {cards.length}
                  </option>
                ))}
              </select>
              <button
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage >= pageCount - 1}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {previewCard && <CardPreviewModal card={previewCard} onClose={closePreview} />}

      {/* ── History tab ───────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <>
          {sessions.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <p>No sessions yet</p>
              <p className="text-sm mt-1">Complete a study session to see history</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {session.cards_studied} card{session.cards_studied !== 1 ? 's' : ''} studied
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {new Date(session.completed_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {session.cards_studied > 0
                        ? Math.round((session.correct_count / session.cards_studied) * 100)
                        : 0}%
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">correct</p>
                    {session.mastered_count > 0 && (
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">+{session.mastered_count} matured</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Settings modal ────────────────────────────────────────────────── */}
      {showSettings && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowSettings(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
            <div className="px-5 pt-5 pb-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors text-xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Rename + description */}
              <div className="mb-5 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Set name</label>
                  <input
                    ref={nameRef}
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveInfo()}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500"
                  />
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Collection</label>
                  <select
                    value={collectionInput}
                    onChange={e => setCollectionInput(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500"
                  >
                    <option value="">None</option>
                    {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tags</label>
                  <TagInput
                    value={tagsInput}
                    onChange={setTagsInput}
                    suggestions={Array.from(new Set(getCachedSets().flatMap(s => s.tags ?? []))).sort()}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublicInput(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600/50 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {isPublicInput ? 'Public' : 'Private'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {isPublicInput ? 'Friends and anyone you share it with can study this' : 'Only visible to you'}
                    </p>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${isPublicInput ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPublicInput ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </button>
              </div>

              {/* FSRS — daily new cards */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Daily new cards
                </label>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
                  How many new cards to introduce per day (like Anki&apos;s new card limit)
                </p>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={dailyLimitInput}
                  onChange={e => setDailyLimitInput(Number(e.target.value))}
                  onBlur={e => saveDailyLimit(Number(e.target.value))}
                  className="w-24 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500"
                />
              </div>

              <button
                onClick={saveInfo}
                className="w-full py-2 mb-5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Save
              </button>

              <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={resetProgress}
                  className="w-full py-3 rounded-xl border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 text-sm font-semibold hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                >
                  Reset all progress
                </button>
                <button
                  onClick={clearAllCards}
                  disabled={cards.length === 0}
                  className="w-full py-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear all cards
                </button>
                <button
                  onClick={deleteSet}
                  className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-100 dark:border-red-800"
                >
                  Delete set
                </button>
              </div>
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
