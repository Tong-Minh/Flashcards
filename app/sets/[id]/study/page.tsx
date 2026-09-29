'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { fsrs, createEmptyCard, Rating, State, type Card as FSRSCard, type RecordLog } from 'ts-fsrs'
import { supabase } from '@/lib/supabase/client'
import {
  cacheCards, getCachedCards, updateCachedProgress,
  queueProgressUpdate, getPendingUpdates, removePendingUpdate,
  saveSessionState, getSavedSession, clearSavedSession,
  getTodayNewCount, incrementTodayNewCount, getSetSettings,
} from '@/lib/storage'
import type { FlashcardWithProgress, CardStatus, CardProgress } from '@/lib/types'
const f = fsrs()

type SRSRating = 1 | 2 | 3 | 4 // Again | Hard | Good | Easy
type Phase     = 'loading' | 'pre-session' | 'session' | 'done'
type Order     = 'ordered' | 'random'
type FlipState = 'front' | 'flipping' | 'back'

interface SessionCard extends FlashcardWithProgress { _key: number }

// ── FSRS helpers ──────────────────────────────────────────────────────────────

function progressToFSRS(p: CardProgress | null | undefined): FSRSCard {
  if (!p) return createEmptyCard()
  return {
    due:            new Date(p.due ?? Date.now()),
    stability:      p.stability      ?? 0,
    difficulty:     p.difficulty     ?? 0,
    elapsed_days:   p.elapsed_days   ?? 0,
    scheduled_days: p.scheduled_days ?? 0,
    reps:           p.reps           ?? 0,
    lapses:         p.lapses         ?? 0,
    learning_steps: p.learning_steps ?? 0,
    state:          (p.fsrs_state    ?? 0) as State,
    last_review:    p.last_review ? new Date(p.last_review) : undefined,
  }
}

function formatInterval(card: FSRSCard): string {
  const mins = Math.round((card.due.getTime() - Date.now()) / 60000)
  if (mins < 1)    return '<1m'
  if (mins < 60)   return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24)  return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 31)   return `${days}d`
  return `${Math.round(days / 30)}mo`
}

function deriveStatus(card: FSRSCard): CardStatus {
  switch (card.state) {
    case State.New:        return 'new'
    case State.Learning:   return 'learning'
    case State.Relearning: return 'needs_review'
    default:               return card.scheduled_days >= 21 ? 'mastered' : 'learning'
  }
}

function isDue(p: CardProgress | null | undefined): boolean {
  if (!p || (p.fsrs_state ?? 0) === State.New) return false
  return new Date(p.due ?? Date.now()) <= new Date()
}

function isNew(p: CardProgress | null | undefined): boolean {
  return !p || (p.fsrs_state ?? 0) === State.New
}

// ── Queue builder ─────────────────────────────────────────────────────────────

function buildQueue(
  cards: FlashcardWithProgress[],
  order: Order,
  progressOverrides: Map<string, CardProgress>,
  remainingNew: number,
): { queue: FlashcardWithProgress[]; dueCount: number; newCount: number } {
  const resolve = (c: FlashcardWithProgress) => progressOverrides.get(c.id) ?? c.progress

  const dueCards = cards.filter(c => isDue(resolve(c)))
  const newCards  = cards.filter(c => isNew(resolve(c))).slice(0, Math.max(0, remainingNew))

  const combined = [...dueCards, ...newCards]
  const sorted = order === 'random' ? combined.sort(() => Math.random() - 0.5) : combined
  return { queue: sorted, dueCount: dueCards.length, newCount: newCards.length }
}

// ── Fill-in-the-blank renderer ────────────────────────────────────────────────

function ClozeQuestion({ sentence, answer }: { sentence: string; answer?: string }) {
  const parts = sentence.split('___')
  return (
    <p className="text-xl font-medium text-gray-900 dark:text-gray-100 leading-relaxed flex-1">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            answer
              ? <span className="inline-block bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 font-semibold px-2 py-0.5 rounded mx-0.5">{answer}</span>
              : <span className="inline-block border-b-2 border-gray-400 dark:border-gray-500 w-16 mx-1 align-bottom" />
          )}
        </span>
      ))}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Study() {
  const { id: setId } = useParams<{ id: string }>()
  const router = useRouter()

  const [phase,        setPhase]       = useState<Phase>('loading')
  const [allCards,     setAllCards]    = useState<FlashcardWithProgress[]>([])
  const [isOffline,    setIsOffline]   = useState(false)
  const [savedSession, setSavedSession] = useState<ReturnType<typeof getSavedSession>>(null)

  const [order, setOrder] = useState<Order>('ordered')

  const [queue,          setQueue]         = useState<SessionCard[]>([])
  const [totalInSession, setTotalInSession] = useState(0)
  const statsRef      = useRef({ cardsStudied: 0, correctCount: 0, masteredCount: 0 })
  const sessionStart  = useRef<number>(0)
  const [displayStats, setDisplayStats]   = useState({ cardsStudied: 0, correctCount: 0, masteredCount: 0 })
  const progressMap = useRef(new Map<string, CardProgress>())

  const [scheduling, setScheduling] = useState<RecordLog | null>(null)

  const [flipState,      setFlipState]      = useState<FlipState>('front')
  const [showBack,       setShowBack]       = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [cardKey,        setCardKey]        = useState(0)

  const [dueCount,      setDueCount]      = useState(0)
  const [newCount,      setNewCount]      = useState(0)
  const [todayNewCount, setTodayNewCount] = useState(0)
  const [dailyLimit,    setDailyLimit]    = useState(20)
  const countedNewIds = useRef(new Set<string>())

  useEffect(() => { syncPending().then(loadCards) }, [setId])

  async function syncPending() {
    if (!navigator.onLine) return
    for (const u of getPendingUpdates().filter(p => p.setId === setId)) {
      try {
        const { error } = await supabase.from('card_progress').upsert({
          card_id:        u.cardId,
          due:            u.due,
          stability:      u.stability,
          difficulty:     u.difficulty,
          elapsed_days:   u.elapsedDays,
          scheduled_days: u.scheduledDays,
          reps:           u.reps,
          lapses:         u.lapses,
          learning_steps: u.learningSteps,
          fsrs_state:     u.fsrsState,
          last_review:    u.lastReview,
          status:         u.status,
          correct_count:  u.correctCount,
          last_reviewed:  u.lastReviewed,
        }, { onConflict: 'user_id,card_id' })
        if (!error) removePendingUpdate(u.cardId)
      } catch {}
    }
  }

  async function loadCards() {
    const cached = getCachedCards(setId)
    let cards: FlashcardWithProgress[] = cached

    if (navigator.onLine) {
      try {
        const { data } = await supabase
          .from('flashcards')
          .select('*, progress:card_progress(*)')
          .eq('set_id', setId)
          .order('created_at', { ascending: true })
        if (data) {
          cards = data.map(c => ({ ...c, progress: Array.isArray(c.progress) ? (c.progress[0] ?? null) : c.progress }))
          cacheCards(setId, cards)
        }
      } catch { setIsOffline(true) }
    } else {
      setIsOffline(true)
    }

    const todayCount = getTodayNewCount(setId)
    const { dailyNewLimit } = getSetSettings(setId)
    const remaining  = Math.max(0, dailyNewLimit - todayCount)
    const { dueCount: d, newCount: n } = buildQueue(cards, 'ordered', new Map(), remaining)
    setAllCards(cards)
    setDueCount(d)
    setNewCount(n)
    setTodayNewCount(todayCount)
    setDailyLimit(dailyNewLimit)
    setSavedSession(getSavedSession(setId))
    setPhase(cards.length === 0 ? 'done' : 'pre-session')
  }

  function startSession(type: 'new' | 'continue') {
    progressMap.current = new Map()

    if (type === 'continue' && savedSession) {
      const cardMap = new Map(allCards.map(c => [c.id, c]))
      const restored = savedSession.queueIds
        .map(id => cardMap.get(id)).filter(Boolean) as FlashcardWithProgress[]
      const valid = restored.filter(c => !isCompleted(c.progress))
      setOrder(savedSession.order)
      setTotalInSession(valid.length + savedSession.stats.cardsStudied)
      setQueue(valid.map(c => ({ ...c, _key: 0 })))
      statsRef.current = { ...savedSession.stats }
      setDisplayStats({ ...savedSession.stats })
    } else {
      clearSavedSession(setId)
      countedNewIds.current = new Set()
      const remaining = Math.max(0, getSetSettings(setId).dailyNewLimit - getTodayNewCount(setId))
      const { queue: q } = buildQueue(allCards, order, progressMap.current, remaining)
      setTotalInSession(q.length)
      setQueue(q.map(c => ({ ...c, _key: 0 })))
      statsRef.current = { cardsStudied: 0, correctCount: 0, masteredCount: 0 }
      setDisplayStats({ cardsStudied: 0, correctCount: 0, masteredCount: 0 })
    }

    setFlipState('front')
    setShowBack(false)
    setSelectedOption(null)
    setCardKey(0)
    setScheduling(null)
    sessionStart.current = Date.now()
    setPhase('session')
  }

  function isCompleted(p: CardProgress | null | undefined): boolean {
    if (!p) return false
    return !isDue(p) && !isNew(p)
  }

  async function handleExit() {
    if (queue.length > 0) {
      saveSessionState(setId, {
        queueIds: queue.map(c => c.id),
        stats: statsRef.current,
        order,
        savedAt: new Date().toISOString(),
      })
    }
    if (statsRef.current.cardsStudied > 0) await persistSession()
    router.push(`/sets/${setId}`)
  }

  async function persistSession() {
    const s = statsRef.current
    if (s.cardsStudied === 0 || !navigator.onLine) return
    const duration = sessionStart.current > 0
      ? Math.round((Date.now() - sessionStart.current) / 1000)
      : null
    await supabase.from('study_sessions').insert({
      set_id: setId, cards_studied: s.cardsStudied,
      correct_count: s.correctCount, mastered_count: s.masteredCount,
      duration_seconds: duration,
    })
  }

  function triggerFlip() {
    if (flipState !== 'front') return
    try { navigator.vibrate?.(20) } catch {}
    setFlipState('flipping')
    setTimeout(() => {
      setShowBack(true)
      const card = queue[0]
      if (card) {
        const current = progressMap.current.get(card.id) ?? card.progress
        setScheduling(f.repeat(progressToFSRS(current), new Date()))
      }
    }, 150)
    setTimeout(() => setFlipState('back'), 300)
  }

  async function rate(rating: SRSRating) {
    const card = queue[0]
    if (!card) return

    try { navigator.vibrate?.(30) } catch {}

    const now = new Date()
    const current = progressMap.current.get(card.id) ?? card.progress

    if (isNew(current) && !countedNewIds.current.has(card.id)) {
      countedNewIds.current.add(card.id)
      incrementTodayNewCount(setId)
      setTodayNewCount(c => c + 1)
    }

    const result  = f.repeat(progressToFSRS(current), now)
    const next    = result[rating].card

    const newStatus = deriveStatus(next)
    const becameMastered = newStatus === 'mastered' &&
      (current?.status !== 'mastered')

    const newProgress: CardProgress = {
      id:             current?.id ?? '',
      card_id:        card.id,
      correct_count:  next.reps,
      status:         newStatus,
      last_reviewed:  now.toISOString(),
      due:            next.due.toISOString(),
      stability:      next.stability,
      difficulty:     next.difficulty,
      elapsed_days:   next.elapsed_days,
      scheduled_days: next.scheduled_days,
      reps:           next.reps,
      lapses:         next.lapses,
      learning_steps: (next as FSRSCard & { learning_steps?: number }).learning_steps ?? 0,
      fsrs_state:     next.state as 0 | 1 | 2 | 3,
      last_review:    now.toISOString(),
    }

    progressMap.current.set(card.id, newProgress)
    updateCachedProgress(setId, card.id, newProgress)

    let synced = false
    if (navigator.onLine) {
      try {
        const { error } = await supabase.from('card_progress').upsert({
          card_id:        card.id,
          correct_count:  newProgress.correct_count,
          status:         newProgress.status,
          last_reviewed:  newProgress.last_reviewed,
          due:            newProgress.due,
          stability:      newProgress.stability,
          difficulty:     newProgress.difficulty,
          elapsed_days:   newProgress.elapsed_days,
          scheduled_days: newProgress.scheduled_days,
          reps:           newProgress.reps,
          lapses:         newProgress.lapses,
          learning_steps: newProgress.learning_steps,
          fsrs_state:     newProgress.fsrs_state,
          last_review:    newProgress.last_review,
        }, { onConflict: 'user_id,card_id' })
        synced = !error
      } catch {}
    }
    if (!synced) {
      queueProgressUpdate({
        cardId: card.id, setId,
        correctCount:  newProgress.correct_count,
        status:        newProgress.status,
        lastReviewed:  newProgress.last_reviewed!,
        due:           newProgress.due,
        stability:     newProgress.stability,
        difficulty:    newProgress.difficulty,
        elapsedDays:   newProgress.elapsed_days,
        scheduledDays: newProgress.scheduled_days,
        reps:          newProgress.reps,
        lapses:        newProgress.lapses,
        learningSteps: newProgress.learning_steps,
        fsrsState:     newProgress.fsrs_state,
        lastReview:    newProgress.last_review!,
      })
    }

    const newStats = {
      cardsStudied:  statsRef.current.cardsStudied  + 1,
      correctCount:  statsRef.current.correctCount  + (rating >= Rating.Good ? 1 : 0),
      masteredCount: statsRef.current.masteredCount + (becameMastered ? 1 : 0),
    }
    statsRef.current = newStats
    setDisplayStats({ ...newStats })

    const updatedCard: SessionCard = { ...card, progress: newProgress, _key: card._key + 1 }
    const rest = queue.slice(1)
    const newQueue = rating === Rating.Again ? [...rest, updatedCard] : rest

    if (newQueue.length === 0) {
      await persistSession()
      clearSavedSession(setId)
      setPhase('done')
    } else {
      setFlipState('front')
      setShowBack(false)
      setSelectedOption(null)
      setCardKey(k => k + 1)
      setScheduling(null)
      setQueue(newQueue)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return <div className="max-w-lg mx-auto px-4 py-6 text-center text-gray-400 dark:text-gray-500 py-16">Loading…</div>
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const s = displayStats
    const pct = s.cardsStudied > 0 ? Math.round((s.correctCount / s.cardsStudied) * 100) : 0
    return (
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="text-center w-full">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Session Complete!</h2>
          <p className="text-gray-400 dark:text-gray-500 text-sm mb-6">Nice work — your reviews are scheduled.</p>
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { val: s.cardsStudied, label: 'Reviewed' },
              { val: `${pct}%`, label: 'Correct' },
              { val: s.masteredCount, label: 'Matured' },
            ].map(({ val, label }) => (
              <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{val}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">{label}</div>
              </div>
            ))}
          </div>
          <Link href={`/sets/${setId}`} className="block w-full bg-indigo-600 text-white px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors">
            Back to Set
          </Link>
        </div>
      </div>
    )
  }

  // ── Pre-session ────────────────────────────────────────────────────────────
  if (phase === 'pre-session') {
    const totalToStudy   = dueCount + newCount
    const nothing        = totalToStudy === 0
    const limitReached   = todayNewCount >= dailyLimit
    const remainingToday = Math.max(0, dailyLimit - todayNewCount)

    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-8">
          <Link href={`/sets/${setId}`} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors">←</Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Study</h1>
        </div>

        {isOffline && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400 rounded-xl px-4 py-3 mb-5 text-sm">
            Offline — studying from cache. Progress syncs when you reconnect.
          </div>
        )}

        {/* Session overview */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 mb-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-4">Today&apos;s session</p>

          {nothing ? (
            <div className="text-center py-2">
              <p className="text-green-600 dark:text-green-400 font-semibold text-lg">All caught up!</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                {limitReached
                  ? 'Daily new card limit reached — come back tomorrow.'
                  : 'No cards due right now. Check back later.'}
              </p>
            </div>
          ) : (
            <div className="flex gap-4 justify-center">
              {dueCount > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{dueCount}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">due for review</div>
                </div>
              )}
              {dueCount > 0 && newCount > 0 && (
                <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch" />
              )}
              {newCount > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-500 dark:text-blue-400">{newCount}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    new · {remainingToday}/{dailyLimit} today
                  </div>
                </div>
              )}
            </div>
          )}

          {!nothing && (
            <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-4">
              FSRS · up to {dailyLimit} new cards per day
            </p>
          )}
        </div>

        {/* Order toggle */}
        {!nothing && (
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Study order</p>
            <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              {(['ordered', 'random'] as Order[]).map(o => (
                <button key={o} onClick={() => setOrder(o)}
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${order === o ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                >
                  {o === 'ordered' ? 'In Order' : 'Random'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-3">
          {savedSession && (
            <button onClick={() => startSession('continue')}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
            >
              Continue ({savedSession.queueIds.length} remaining)
            </button>
          )}
          {!nothing && (
            <button onClick={() => startSession('new')}
              className={`w-full py-4 rounded-2xl font-semibold text-base transition-colors ${
                savedSession
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm'
              }`}
            >
              {savedSession ? 'Start New Session' : `Study Now — ${totalToStudy} card${totalToStudy !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Session ────────────────────────────────────────────────────────────────
  const card = queue[0]
  const done = totalInSession - queue.length
  const cardNumber = done + 1
  const progressPct = totalInSession > 0 ? (done / totalInSession) * 100 : 0
  const isCorrectSelection = selectedOption !== null && selectedOption === card.answer

  const cardAnimClass = flipState === 'flipping' ? 'card-flip' : ''

  const intervals = scheduling ? {
    again: formatInterval(scheduling[Rating.Again].card),
    hard:  formatInterval(scheduling[Rating.Hard].card),
    good:  formatInterval(scheduling[Rating.Good].card),
    easy:  formatInterval(scheduling[Rating.Easy].card),
  } : null

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={handleExit} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors font-medium">
          ← Exit
        </button>
        <p className="text-sm text-gray-400 dark:text-gray-500">{cardNumber} / {totalInSession}</p>
        <div className="w-12" />
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full mb-5 overflow-hidden">
        <div className="h-2 bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Card */}
      <div
        key={cardKey}
        className={`${flipState === 'front' ? 'card-enter' : ''} bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 p-6 mb-5 min-h-[220px] flex flex-col ${cardAnimClass}`}
        onClick={!showBack && (card.type === 'open_ended' || card.type === 'fill_blank') ? triggerFlip : undefined}
        style={{ cursor: !showBack && (card.type === 'open_ended' || card.type === 'fill_blank') ? 'pointer' : 'default' }}
      >
        {!showBack ? (
          <div className="flex flex-col flex-1">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
              {card.type === 'multiple_choice' ? 'Multiple Choice'
               : card.type === 'fill_blank'   ? 'Fill in the blank'
               : 'Tap to reveal answer'}
            </p>
            {card.type === 'fill_blank'
              ? <ClozeQuestion sentence={card.question} />
              : <p className="text-xl font-medium text-gray-900 dark:text-gray-100 leading-relaxed flex-1">{card.question}</p>
            }
            {card.type === 'multiple_choice' && card.options && (
              <div className="mt-5 space-y-2">
                {card.options.map((opt, i) => (
                  <button key={i}
                    onClick={e => { e.stopPropagation(); try { navigator.vibrate?.(20) } catch {}; setSelectedOption(opt); triggerFlip() }}
                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors font-medium"
                  >
                    <span className="text-gray-400 dark:text-gray-500 mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col flex-1">
            {card.type === 'fill_blank' ? (
              <div className="flex flex-col flex-1">
                <p className="text-xs font-medium text-indigo-400 dark:text-indigo-400 uppercase tracking-wide mb-3">Answer</p>
                <ClozeQuestion sentence={card.question} answer={card.answer} />
              </div>
            ) : (
              <>
                <div className="mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Question</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{card.question}</p>
                </div>
                <div className="flex flex-col flex-1">
                  <p className="text-xs font-medium text-indigo-400 dark:text-indigo-400 uppercase tracking-wide mb-2">Answer</p>
                  {card.type === 'multiple_choice' && selectedOption && (
                    <div className={`flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
                      isCorrectSelection
                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    }`}>
                      {isCorrectSelection ? '✓ Correct!' : `✗ Incorrect — you picked: ${selectedOption}`}
                    </div>
                  )}
                  <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-relaxed flex-1">{card.answer}</p>
                  {card.type === 'multiple_choice' && card.options && (
                    <div className="mt-4 space-y-1.5">
                      {card.options.map((opt, i) => {
                        const isCorrect  = opt === card.answer
                        const isSelected = opt === selectedOption
                        return (
                          <div key={i} className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${
                            isCorrect  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium border border-green-200 dark:border-green-800'
                            : isSelected ? 'bg-red-50 dark:bg-red-900/20 text-red-400 dark:text-red-500 line-through border border-red-100 dark:border-red-900'
                            : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            <span>{String.fromCharCode(65 + i)}.</span>
                            <span>{opt}</span>
                            {isCorrect && <span className="ml-auto">✓</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {showBack ? (
        <div className="grid grid-cols-4 gap-2 fade-in">
          <button onClick={() => rate(Rating.Again)}
            className="flex flex-col items-center py-3.5 rounded-2xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 active:bg-red-200 transition-colors border border-red-100 dark:border-red-900"
          >
            <span className="text-base font-semibold">Again</span>
            {intervals && <span className="text-xs text-red-400 dark:text-red-500 mt-0.5">{intervals.again}</span>}
          </button>
          <button onClick={() => rate(Rating.Hard)}
            className="flex flex-col items-center py-3.5 rounded-2xl bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 active:bg-orange-200 transition-colors border border-orange-100 dark:border-orange-900"
          >
            <span className="text-base font-semibold">Hard</span>
            {intervals && <span className="text-xs text-orange-400 dark:text-orange-500 mt-0.5">{intervals.hard}</span>}
          </button>
          <button onClick={() => rate(Rating.Good)}
            className="flex flex-col items-center py-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 active:bg-indigo-200 transition-colors border border-indigo-100 dark:border-indigo-900"
          >
            <span className="text-base font-semibold">Good</span>
            {intervals && <span className="text-xs text-indigo-400 dark:text-indigo-500 mt-0.5">{intervals.good}</span>}
          </button>
          <button onClick={() => rate(Rating.Easy)}
            className="flex flex-col items-center py-3.5 rounded-2xl bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 active:bg-green-200 transition-colors border border-green-100 dark:border-green-900"
          >
            <span className="text-base font-semibold">Easy</span>
            {intervals && <span className="text-xs text-green-400 dark:text-green-500 mt-0.5">{intervals.easy}</span>}
          </button>
        </div>
      ) : (
        (card.type === 'open_ended' || card.type === 'fill_blank') && (
          <button onClick={triggerFlip}
            className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            Show Answer
          </button>
        )
      )}
    </div>
  )
}
