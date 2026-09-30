'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useUser } from '@/components/AuthGuard'
import {
  cacheCards, getCachedCards, getCachedSets,
  cacheSetStats, getCachedSetStats,
  getSetSettings, saveSetSettings,
  resetTodayNewCount, clearSavedSession,
  getCachedCollections, cacheSets,
} from '@/lib/storage'
import { fetchAllRows, MAX_CARDS_PER_SET } from '@/lib/fetchAll'
import { previewText, ContentRenderer, hasFormattedContent } from '@/components/ContentRenderer'
import { CardPreviewModal } from '@/components/CardPreview'
import { TagInput } from '@/components/TagInput'
import { IconPicker } from '@/components/IconPicker'
import { ShareButton } from '@/components/ShareButton'
import { DetailHeader, SettingsButton } from '@/components/DetailHeader'
import { SearchBar } from '@/components/SearchBar'
import { SetPickerSheet } from '@/components/SetPickerSheet'
import { useLongPress } from '@/lib/useLongPress'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers'
import { SortableRow } from '@/components/SortableRow'
import { Pencil } from 'lucide-react'
import { exportCards, downloadText } from '@/lib/cardFormat'
import { TYPE_BADGES } from '@/lib/cardTypes'
import type { CardStatus, Collection, FlashcardSet, FlashcardWithProgress, SetStudyStats } from '@/lib/types'

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
  // Your totals for this set (recent sessions + rolled-up older history, via the set_study_stats view)
  const [stats,    setStats]    = useState<SetStudyStats | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [forking,     setForking]     = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [page,         setPage]         = useState(0)
  const [previewCard,  setPreviewCard]  = useState<FlashcardWithProgress | null>(null)
  const [collections,  setCollections]  = useState<Collection[]>([])
  const [cardQuery,    setCardQuery]    = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | CardStatus>('all')
  const [showTransferMenu, setShowTransferMenu] = useState(false)

  // Card selection (owner only): long-press a card or tap Select, then move / reset / delete in bulk
  const [selecting,     setSelecting]     = useState(false)
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set())
  const [showSetPicker, setShowSetPicker] = useState(false)
  const [cardBusy,      setCardBusy]      = useState(false)
  const pressedCardId = useRef<string | null>(null)
  const cardLongPress = useLongPress(() => {
    const cardId = pressedCardId.current
    if (!cardId) return
    setSelecting(true)
    toggleCard(cardId)
  })
  const cardsTopRef = useRef<HTMLDivElement>(null)

  // Settings sheet
  const [showSettings,      setShowSettings]      = useState(false)
  const [nameInput,         setNameInput]         = useState('')
  const [descInput,         setDescInput]         = useState('')
  const [isPublicInput,     setIsPublicInput]     = useState(true)
  const [dailyLimitInput,   setDailyLimitInput]   = useState(20)
  const [tagsInput,         setTagsInput]         = useState<string[]>([])
  const [collectionInput,   setCollectionInput]   = useState('')
  const [iconInput,         setIconInput]         = useState<{ icon: string | null; color: string | null }>({ icon: null, color: null })
  const nameRef = useRef<HTMLInputElement>(null)

  const isOwner = !!currentUser && !!set && set.user_id === currentUser.id

  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    const cachedCards = getCachedCards(id)
    const cachedSets  = getCachedSets()
    const cachedSet   = cachedSets.find(s => s.id === id) ?? null
    const cachedStats = getCachedSetStats(id)

    if (cachedSet || cachedCards.length > 0) {
      if (cachedSet) {
        setSet(cachedSet)
        setNameInput(cachedSet.name)
        setDescInput(cachedSet.description ?? '')
        setIsPublicInput(cachedSet.is_public ?? false)
        setTagsInput(cachedSet.tags ?? [])
        setCollectionInput(cachedSet.collection_id ?? '')
        setIconInput({ icon: cachedSet.icon ?? null, color: cachedSet.color ?? null })
      }
      if (cachedCards.length > 0) setCards(cachedCards)
      if (cachedStats) setStats(cachedStats)
      setLoading(false)
    }

    setCollections(getCachedCollections())
    const settings = getSetSettings(id)
    setDailyLimitInput(settings.dailyNewLimit)

    if (!navigator.onLine) { setLoading(false); return }

    const [setRes, rawCards, statsRes, collectionsRes] = await Promise.all([
      supabase.from('sets').select('*').eq('id', id).single(),
      fetchAllRows<FlashcardWithProgress>(() => supabase
        .from('flashcards')
        .select('*, progress:card_progress(*)')
        .eq('set_id', id)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }), MAX_CARDS_PER_SET),
      supabase.from('set_study_stats').select('sessions, cards_studied, correct_count, mastered_count, last_studied_at').eq('set_id', id).maybeSingle(),
      // Own collections only: RLS also returns other people's shared ones
      supabase.from('collections').select('*').eq('user_id', currentUser?.id ?? '00000000-0000-0000-0000-000000000000').order('name'),
    ])

    if (!setRes.data) { router.push('/'); return }

    const freshCards = rawCards.map((c) => ({
      ...c,
      progress: Array.isArray(c.progress) ? (c.progress[0] ?? null) : c.progress,
    }))
    const freshStats = (statsRes.data as SetStudyStats | null) ?? null

    setSet(setRes.data)
    setNameInput(setRes.data.name)
    setDescInput(setRes.data.description ?? '')
    setIsPublicInput(setRes.data.is_public ?? false)
    setTagsInput(setRes.data.tags ?? [])
    setCollectionInput(setRes.data.collection_id ?? '')
    setIconInput({ icon: setRes.data.icon ?? null, color: setRes.data.color ?? null })
    if (collectionsRes.data) setCollections(collectionsRes.data)
    setCards(freshCards)
    setStats(freshStats)
    cacheCards(id, freshCards)
    cacheSetStats(id, freshStats)
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
      icon: iconInput.icon,
      color: iconInput.color,
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

  function toggleCard(cardId: string) {
    setSelectedCards(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  function exitCardSelect() {
    setSelecting(false)
    setSelectedCards(new Set())
  }

  // Applies to the selected cards, in chunks so id lists stay well under URL length limits
  async function forSelected(fn: (chunk: string[]) => PromiseLike<{ error: unknown }>) {
    const ids = [...selectedCards]
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await fn(ids.slice(i, i + 200))
      if (error) throw error
    }
  }

  function adjustCachedCount(setId: string, delta: number) {
    cacheSets(getCachedSets().map(s => (s.id === setId ? { ...s, totalCards: Math.max(0, (s.totalCards ?? 0) + delta) } : s)))
  }

  async function deleteSelectedCards() {
    const n = selectedCards.size
    if (!confirm(`Delete ${n} card${n !== 1 ? 's' : ''}? This can't be undone.`)) return
    setCardBusy(true)
    try {
      // card_progress rows cascade-delete with their cards
      await forSelected(chunk => supabase.from('flashcards').delete().in('id', chunk))
      const remaining = cards.filter(c => !selectedCards.has(c.id))
      setCards(remaining)
      cacheCards(id, remaining)
      adjustCachedCount(id, -n)
      exitCardSelect()
    } catch {
      alert('Could not delete the cards. Please try again.')
    } finally {
      setCardBusy(false)
    }
  }

  async function resetSelectedCards() {
    const n = selectedCards.size
    if (!confirm(`Reset progress on ${n} card${n !== 1 ? 's' : ''}? They go back to New.`)) return
    setCardBusy(true)
    try {
      await forSelected(chunk => supabase.from('card_progress').delete().in('card_id', chunk))
      const reset = cards.map(c => (selectedCards.has(c.id) ? { ...c, progress: null } : c))
      setCards(reset)
      cacheCards(id, reset)
      exitCardSelect()
    } catch {
      alert('Could not reset the cards. Please try again.')
    } finally {
      setCardBusy(false)
    }
  }

  async function moveSelectedCards(destId: string) {
    const moving = cards.filter(c => selectedCards.has(c.id))
    const dest = getCachedSets().find(s => s.id === destId)
    setShowSetPicker(false)
    setCardBusy(true)
    try {
      const { count } = await supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('set_id', destId)
      if ((count ?? 0) + moving.length > MAX_CARDS_PER_SET) {
        alert(`"${dest?.name ?? 'That set'}" can only take ${Math.max(0, MAX_CARDS_PER_SET - (count ?? 0))} more cards.`)
        return
      }
      // Moved cards go to the end of the other set; their study progress comes with them
      await forSelected(chunk => supabase.from('flashcards').update({ set_id: destId, position: null }).in('id', chunk))
      const remaining = cards.filter(c => !selectedCards.has(c.id))
      setCards(remaining)
      cacheCards(id, remaining)
      const destCached = getCachedCards(destId)
      if (destCached.length > 0) cacheCards(destId, [...destCached, ...moving.map(c => ({ ...c, set_id: destId, position: null }))])
      adjustCachedCount(id, -moving.length)
      adjustCachedCount(destId, moving.length)
      exitCardSelect()
    } catch {
      alert('Could not move the cards. Please try again.')
    } finally {
      setCardBusy(false)
    }
  }

  function exportSet() {
    const filename = `${(set?.name ?? 'flashcards').replace(/[\\/:*?"<>|]+/g, '').trim() || 'flashcards'}.txt`
    downloadText(filename, exportCards(cards))
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

  // Drag to reorder (owner, unfiltered list). Mouse drags from anywhere on a card; touch uses the
  // grip shown in selection mode, like sets on the home screen.
  const cardSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  // The click that ends a drag must not open the card preview
  const cardDragged = useRef(false)

  async function handleCardDragEnd({ active, over }: DragEndEvent) {
    setTimeout(() => { cardDragged.current = false }, 0)
    if (!over || active.id === over.id) return
    const from = cards.findIndex(c => c.id === active.id)
    const to   = cards.findIndex(c => c.id === over.id)
    if (from < 0 || to < 0) return
    const before  = cards
    const moved   = arrayMove(cards, from, to)
    const changed = moved.flatMap((c, i) => (c.position !== i ? [{ id: c.id, position: i }] : []))
    const next    = moved.map((c, i) => ({ ...c, position: i }))
    setCards(next)
    cacheCards(id, next)
    const { error } = await supabase.rpc('reorder_cards', {
      card_ids: changed.map(c => c.id),
      positions: changed.map(c => c.position),
    })
    if (error) { setCards(before); cacheCards(id, before) }
  }

  if (loading && !set) {
    return <div className="max-w-lg lg:max-w-6xl mx-auto px-4 py-6 lg:px-8 lg:py-8 text-center text-gray-400 dark:text-gray-500 py-16">Loading…</div>
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
  const statusCounts  = cards.reduce<Record<string, number>>((acc, c) => {
    const s = c.progress?.status ?? 'new'
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})
  const q             = cardQuery.trim().toLowerCase()
  const filtering     = !!q || statusFilter !== 'all'
  // "#12" finds card 12 only; a bare "12" finds card 12 plus any card whose text contains 12
  const numberQuery   = q.match(/^#?(\d+)$/)
  const cardNumber    = numberQuery ? Number(numberQuery[1]) : null
  const textQuery     = q.startsWith('#') && numberQuery ? '' : q
  // Keep each card's index in the full list: it's the card number shown on each row
  const filteredCards = cards
    .map((card, idx) => ({ card, idx }))
    .filter(({ card, idx }) =>
      (statusFilter === 'all' || (card.progress?.status ?? 'new') === statusFilter) &&
      (!q || idx + 1 === cardNumber ||
        (!!textQuery && [card.question, card.answer, ...(card.options ?? []), ...(card.pairs ?? []).flatMap(p => [p.left, p.right])]
          .some(t => t?.toLowerCase().includes(textQuery)))))
  const canReorderCards = isOwner && !filtering
  const allFilteredSelected = filteredCards.length > 0 && filteredCards.every(f => selectedCards.has(f.card.id))
  const pageCount     = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE))
  const safePage      = Math.min(page, pageCount - 1)
  const pageStart     = safePage * PAGE_SIZE
  const pageCards     = filteredCards.slice(pageStart, pageStart + PAGE_SIZE)

  function closePreview() { setPreviewCard(null) }

  function goToPage(p: number) {
    setPage(p)
    cardsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const lastStudied   = stats?.last_studied_at ?? null
  const totalSessions = stats?.sessions ?? 0
  const avgCorrect    = stats && stats.cards_studied > 0
    ? Math.round((stats.correct_count / stats.cards_studied) * 100)
    : null

  return (
    <div className="max-w-lg lg:max-w-6xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      {/* Desktop: the set (header, stats, Study) stays in a sticky left column beside the card list */}
      <div className="lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:gap-10 lg:items-start">
      <div className="lg:sticky lg:top-8">
      <DetailHeader
        kind="set"
        backHref={setCollection ? `/collections/${setCollection.id}` : '/'}
        collection={setCollection}
        icon={set?.icon}
        color={set?.color}
        name={set?.name}
        description={set?.description}
        tags={set?.tags}
        badge={set && !set.is_public && (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">Private</span>
        )}
        actions={<>
          {set && (isOwner || set.is_public) && (
            <ShareButton
              kind="set"
              id={id}
              name={set.name}
              isPublic={set.is_public}
              isOwner={isOwner}
              onMadePublic={() => {
                setSet(s => s ? { ...s, is_public: true } : s)
                setIsPublicInput(true)
                cacheSets(getCachedSets().map(s => (s.id === id ? { ...s, is_public: true } : s)))
              }}
            />
          )}
          {isOwner && <SettingsButton onClick={() => setShowSettings(true)} />}
        </>}
      />

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

      {/* Study CTA: View on the left, Study on the right (order-first / order-last) */}
      <div className="flex gap-3 mb-5">
        {cards.length > 0 ? (
          <Link
            href={`/sets/${id}/study`}
            className="order-last flex-1 block text-center bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
          >
            {dueToday > 0 ? `Study — ${dueToday} due` : 'Study'}
          </Link>
        ) : (
          <button
            disabled
            className="order-last flex-1 text-center bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg opacity-40 cursor-not-allowed shadow-sm"
          >
            Study
          </button>
        )}
        {cards.length > 0 && (
          <Link
            href={`/sets/${id}/study?mode=view`}
            title="Flip through every card without affecting stats or scheduling"
            className="order-first flex items-center gap-1.5 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
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
                <div className="absolute left-0 top-full mt-2 z-20 w-52 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 overflow-hidden">
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

      </div>

      <div className="min-w-0">
      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      <div ref={cardsTopRef} className="flex items-center justify-between mb-3 scroll-mt-4">
        {selecting ? (
          <>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{selectedCards.size} selected</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedCards(allFilteredSelected ? new Set() : new Set(filteredCards.map(f => f.card.id)))}
                className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
              >
                {allFilteredSelected ? 'Select none' : filtering ? `Select all ${filteredCards.length}` : 'Select all'}
              </button>
              <button onClick={exitCardSelect} className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                {selectedCards.size === 0 ? 'Cancel' : 'Done'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {filtering && `${filteredCards.length} of `}{cards.length} card{cards.length !== 1 ? 's' : ''}
            </h2>
            <div className="flex items-center gap-1">
              {isOwner && cards.length > 0 && (
                <button
                  onClick={() => setSelecting(true)}
                  className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-2 py-1.5"
                >
                  Select
                </button>
              )}
              {(cards.length > 0 || (isOwner && !atCardLimit)) && (
                <div className="relative">
                  <button
                    onClick={() => setShowTransferMenu(v => !v)}
                    className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-2 py-1.5"
                  >
                    {isOwner && !atCardLimit ? 'Import/Export' : 'Export'} ▾
                  </button>
                  {showTransferMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowTransferMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-60 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 overflow-hidden">
                        {isOwner && !atCardLimit && (
                          <Link href={`/sets/${id}/import`} className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Import cards</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Paste text or generate with AI</p>
                          </Link>
                        )}
                        {cards.length > 0 && (
                          <button
                            onClick={() => { setShowTransferMenu(false); exportSet() }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Export as .txt</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">In the import format, to re-import or share</p>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {isOwner && atCardLimit && (
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">Limit of {MAX_CARDS_PER_SET.toLocaleString()} reached</span>
              )}
              {isOwner && !atCardLimit && (
                <Link
                  href={`/sets/${id}/create`}
                  className="ml-1 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                >
                  + Add
                </Link>
              )}
            </div>
          </>
        )}
      </div>

      {cards.length > 0 && (
        <>
          <SearchBar
            value={cardQuery}
            onChange={v => { setCardQuery(v); setPage(0) }}
            placeholder="Search questions, answers, or #card number"
            className="mb-2"
          />
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap">
            {(['all', 'new', 'learning', 'needs_review', 'mastered'] as const).map(s => {
              const count = s === 'all' ? cards.length : statusCounts[s] ?? 0
              return (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(0) }}
                  disabled={s !== 'all' && count === 0}
                  className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-40 ${
                    statusFilter === s
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {s === 'all' ? 'All' : STATUS_STYLES[s].label} · {count}
                </button>
              )
            })}
          </div>
        </>
      )}

      {cards.length === 0 ? (
        <div className="text-center text-gray-400 dark:text-gray-500 py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          <p className="mb-1">No cards yet</p>
          <p className="text-sm">Add cards or import a list</p>
        </div>
      ) : filteredCards.length === 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">No cards match</p>
      ) : (
        <DndContext
          sensors={cardSensors}
          collisionDetection={closestCenter}
          // Cards only move up and down, and stay on screen
          modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
          onDragStart={() => { cardDragged.current = true }}
          onDragCancel={() => { cardDragged.current = false }}
          onDragEnd={handleCardDragEnd}
        >
        <SortableContext items={pageCards.map(p => p.card.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {pageCards.map(({ card, idx }) => {
            const status = card.progress?.status ?? 'new'
            const badge  = STATUS_STYLES[status]
            const isSelected = selectedCards.has(card.id)
            return (
              <SortableRow key={card.id} id={card.id} disabled={!canReorderCards}>
              {({ listeners, handle }) => (
              <div
                {...(isOwner ? cardLongPress : {})}
                onPointerDown={isOwner ? e => {
                  pressedCardId.current = card.id
                  cardLongPress.onPointerDown(e)
                  if (!selecting && canReorderCards) listeners?.onPointerDown?.(e)
                } : undefined}
                onClick={e => {
                  if (cardDragged.current) return
                  if (selecting) { toggleCard(card.id); return }
                  // Edit / reorder controls and links inside content keep their own behavior
                  if ((e.target as HTMLElement).closest('a, button')) return
                  setPreviewCard(card)
                }}
                className={`bg-white dark:bg-gray-800 rounded-xl p-3.5 shadow-sm border cursor-pointer transition-colors [-webkit-touch-callout:none] ${
                  isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                    : 'border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800'
                } ${selecting ? 'select-none' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Number in its own column so formatted (block-level) questions start on the same line as plain ones */}
                    <div className="flex gap-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <span className="flex-shrink-0 text-gray-400 dark:text-gray-500">{idx + 1}.</span>
                      <div className="flex-1 min-w-0 [&_:is(h1,h2,h3):first-child]:mt-0">
                        {hasFormattedContent(card.question)
                          ? <ContentRenderer text={card.question} readOnly className="text-sm font-medium text-gray-900 dark:text-gray-100" />
                          : previewText(card.question) || (card.type === 'matching' ? 'Match the pairs' : '')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {TYPE_BADGES[card.type]}
                      </span>
                    </div>
                  </div>
                  {selecting && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {canReorderCards && handle}
                      <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                        isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {isSelected && '✓'}
                      </span>
                    </div>
                  )}
                  {isOwner && !selecting && (
                    <Link
                      href={`/sets/${id}/edit/${card.id}`}
                      className="flex-shrink-0 p-1.5 -m-1 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      aria-label="Edit card"
                      title="Edit card"
                    >
                      <Pencil size={16} />
                    </Link>
                  )}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  {card.type === 'matching' && card.pairs ? (
                    <ul className="space-y-0.5">
                      {card.pairs.map((p, i) => (
                        <li key={i} className="text-xs text-gray-600 dark:text-gray-400">
                          {previewText(p.left)} <span className="text-gray-300 dark:text-gray-600">↔</span> {previewText(p.right)}
                        </li>
                      ))}
                    </ul>
                  ) : card.type === 'multiple_choice' && card.options ? (
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
              )}
              </SortableRow>
            )
          })}
        </div>
        </SortableContext>
        </DndContext>
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
                {i * PAGE_SIZE + 1}–{Math.min((i + 1) * PAGE_SIZE, filteredCards.length)} of {filteredCards.length}
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

      </div>
      </div>

      {previewCard && <CardPreviewModal card={previewCard} onClose={closePreview} />}

      {selecting && (
        <>
          <div className="h-28" />
          <div className="fixed-bar fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-800/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
              {/* Nothing picked yet: offer a way out in thumb reach instead of disabled actions */}
              {selectedCards.size === 0 ? (
                <button
                  onClick={exitCardSelect}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              ) : [
                { label: 'Move',  onClick: () => setShowSetPicker(true), cls: 'bg-indigo-600 text-white hover:bg-indigo-700' },
                { label: 'Reset', onClick: resetSelectedCards,          cls: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600' },
                { label: 'Delete', onClick: deleteSelectedCards,        cls: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40' },
              ].map(b => (
                <button
                  key={b.label}
                  onClick={b.onClick}
                  disabled={cardBusy}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${b.cls}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {showSetPicker && (
        <SetPickerSheet
          title={`Move ${selectedCards.size} card${selectedCards.size !== 1 ? 's' : ''} to…`}
          sets={getCachedSets().filter(s => s.id !== id)}
          onPick={moveSelectedCards}
          onClose={() => setShowSetPicker(false)}
        />
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
                  <div className="flex items-center gap-3">
                  <IconPicker
                    icon={iconInput.icon}
                    color={iconInput.color}
                    onChange={setIconInput}
                  />
                  <input
                    ref={nameRef}
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveInfo()}
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
