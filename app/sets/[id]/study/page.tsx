'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRouteIds } from '@/lib/useRouteIds'
import Link from 'next/link'
import { createEmptyCard, Rating, State, type Card as FSRSCard, type FSRS, type RecordLog } from 'ts-fsrs'
import { haptic, hasTextSelection } from '@/lib/haptic'
import { store } from '@/lib/store'
import { ContentRenderer, previewText } from '@/components/ContentRenderer'
import { ClozeQuestion, FlipCard } from '@/components/CardPreview'
import { BottomBar, BottomBarSpacer } from '@/components/BottomBar'
import { TypedAnswerInput, TypedResultBanner, TrueFalseButtons, MatchingBoard, MatchingPairsList } from '@/components/StudyInteractions'
import { checkTypedAnswer, type TypedResult } from '@/lib/answerCheck'
import {
  cacheCards, getCachedCards, updateCachedProgress,
  queueProgressUpdate, getPendingUpdates, removePendingUpdate,
  queueReview, getPendingReviews, removePendingReview,
  saveSessionState, getSavedSession, clearSavedSession,
  getTodayNewCount, incrementTodayNewCount, decrementTodayNewCount, getSetSettings,
} from '@/lib/storage'
import type { FlashcardWithProgress, CardStatus, CardProgress, FSRSState, ReviewLog } from '@/lib/types'
import { paths } from '@/lib/paths'
import { audioClips, isAudioOnly } from '@/lib/markup'
import { playClips, stopAudio } from '@/lib/audio'
import { IS_DESKTOP } from '@/lib/platform'
import { nextStudyDay } from '@/lib/day'
import { cardFace, progressKey, progressToFSRS, studyItems } from '@/lib/srs'
import { cachedSettings, loadSettings, retentionFor, scheduler } from '@/lib/studySettings'
import { UndoToast, type Toast } from '@/components/UndoToast'
import { Ban, EyeOff, Undo2, type LucideIcon } from 'lucide-react'

type SRSRating  = 1 | 2 | 3 | 4
type Phase      = 'loading' | 'pre-session' | 'session' | 'view' | 'done'
type Order      = 'ordered' | 'random'
type FlipState  = 'front' | 'flipping' | 'back'
type CustomMode = 'ahead' | 'more_new' | 'forgotten' | 'by_state'

// One direction of a card: `progress` is that direction's (a reversed card is two items, ord 0 and 1)
interface StudyItem extends FlashcardWithProgress { ord: number }
interface SessionCard extends StudyItem { _key: number }

const itemKey = (c: { id: string; ord: number }) => progressKey(c.id, c.ord)

// The web app leaves out directions whose question is only audio: it can't play them
function toItems(cards: FlashcardWithProgress[]): StudyItem[] {
  return studyItems(cards)
    .map(({ card, ord, progress }) => ({ ...card, ord, progress }))
    .filter(item => IS_DESKTOP || !isAudioOnly(cardFace(item, item.ord).question))
}

// What Undo puts back: the card's progress and the session as they were before the action
interface UndoEntry {
  action: 'rate' | 'bury' | 'suspend'
  cardId: string
  ord: number
  prevProgress: CardProgress | null
  // The other direction(s) of a reversed card, buried by the rating
  siblings: { ord: number; prev: CardProgress | null }[]
  prevQueue: SessionCard[]
  prevStats: { cardsStudied: number; correctCount: number; masteredCount: number }
  // The rating counted the card toward today's new-card limit
  countedNew: boolean
  reviewId: string | null
}

// The longest a review counts as taking (someone who walked away mid-card)
const MAX_REVIEW_MS = 5 * 60_000

// ── FSRS helpers ──────────────────────────────────────────────────────────────

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

// Not suspended, and not buried until later today
function isAvailable(p: CardProgress | null | undefined, now = new Date()): boolean {
  return !p?.suspended && !(p?.buried_until && new Date(p.buried_until) > now)
}

// Progress for a card never studied (to carry a bury or suspend)
function emptyProgress(cardId: string, ord = 0): CardProgress {
  const c = createEmptyCard()
  return {
    id: '', card_id: cardId, correct_count: 0, status: 'new', last_reviewed: null, due: c.due.toISOString(),
    stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, learning_steps: 0,
    fsrs_state: 0, last_review: null, ...(ord && { ord }),
  }
}

// ── Queue builder ─────────────────────────────────────────────────────────────

function buildQueue(
  cards: StudyItem[],
  order: Order,
  progressOverrides: Map<string, CardProgress>,
  remainingNew: number,
): { queue: StudyItem[]; dueCount: number; newCount: number } {
  const resolve = (c: StudyItem) => progressOverrides.get(itemKey(c)) ?? c.progress
  const available = cards.filter(c => isAvailable(resolve(c)))
  const dueCards = available.filter(c => isDue(resolve(c)))
  const newCards  = available.filter(c => isNew(resolve(c))).slice(0, Math.max(0, remainingNew))
  const combined = [...dueCards, ...newCards]
  const sorted = order === 'random' ? combined.sort(() => Math.random() - 0.5) : combined
  return { queue: sorted, dueCount: dueCards.length, newCount: newCards.length }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Study() {
  const { id: setId } = useRouteIds()
  const router = useRouter()

  const [phase,        setPhase]        = useState<Phase>('loading')
  const [allCards,     setAllCards]     = useState<FlashcardWithProgress[]>([])
  const [isOffline,    setIsOffline]    = useState(false)
  const [savedSession, setSavedSession] = useState<ReturnType<typeof getSavedSession>>(null)
  const [order,        setOrder]        = useState<Order>('ordered')

  const [queue,          setQueue]         = useState<SessionCard[]>([])
  const [totalInSession, setTotalInSession] = useState(0)
  const statsRef     = useRef({ cardsStudied: 0, correctCount: 0, masteredCount: 0 })
  const sessionStart = useRef<number>(0)
  const [displayStats, setDisplayStats] = useState({ cardsStudied: 0, correctCount: 0, masteredCount: 0 })
  const progressMap = useRef(new Map<string, CardProgress>())

  const [scheduling,     setScheduling]     = useState<RecordLog | null>(null)
  const [flipState,      setFlipState]      = useState<FlipState>('front')
  const [showBack,       setShowBack]       = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  // Typed and matching cards: the outcome shown on the back
  const [typed,          setTyped]          = useState<{ input: string; result: TypedResult } | null>(null)
  const [matchMisses,    setMatchMisses]    = useState<number | null>(null)
  const [cardMinHeight,  setCardMinHeight]  = useState<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardKey,        setCardKey]        = useState(0)
  // The answer has been shown: rating is possible, and Space flips between the sides
  const [revealed,       setRevealed]       = useState(false)
  const [toast,          setToast]          = useState<Toast | null>(null)
  const undoStack   = useRef<UndoEntry[]>([])
  const [undoCount,      setUndoCount]      = useState(0)
  const busy        = useRef(false)
  // Replaced once the set and settings load; until then (and offline) the cached settings
  const fsrsRef     = useRef<FSRS>(null!)
  fsrsRef.current ??= scheduler(cachedSettings().desiredRetention)
  // When the current card appeared, for the review's duration
  const shownAt     = useRef(Date.now())
  useEffect(() => { shownAt.current = Date.now() }, [cardKey, phase])

  // Audio (desktop app): a card's clips play when it appears, the answer's when it's revealed (like
  // Anki), if autoplay is on; R replays the side showing. Leaving the card stops it.
  const playSide = (back: boolean) => {
    const item = queue[0]
    if (!IS_DESKTOP || !item) return
    const face = cardFace(item, item.ord)
    const clips = audioClips(back ? face.answer : face.question)
    if (clips.length) playClips(clips).catch(() => {})
  }
  useEffect(() => {
    stopAudio()
    if (phase === 'session' && cachedSettings().autoplayAudio) playSide(false)
  }, [cardKey, phase])
  useEffect(() => {
    if (revealed && cachedSettings().autoplayAudio) playSide(true)
  }, [revealed])
  useEffect(() => () => stopAudio(), [])

  // Regular session stats
  const [dueCount,      setDueCount]      = useState(0)
  const [newCount,      setNewCount]      = useState(0)
  const [todayNewCount, setTodayNewCount] = useState(0)
  const [dailyLimit,    setDailyLimit]    = useState(20)
  const countedNewIds = useRef(new Set<string>())

  // Custom study stats
  const [showCustom,    setShowCustom]    = useState(false)
  const [aheadCounts,   setAheadCounts]   = useState<{ days: number; count: number }[]>([])
  const [forgottenCount, setForgottenCount] = useState(0)
  const [stateCounts,   setStateCounts]   = useState({ new: 0, learning: 0, needs_review: 0, mastered: 0 })
  const [extraNewCount, setExtraNewCount] = useState(0)

  // View mode (opened from the set page via ?mode=view) — browse every card in set order
  // with no FSRS updates and no session recorded
  const [viewIndex, setViewIndex] = useState(0)
  const viewCards = allCards

  useEffect(() => { syncPending().then(loadCards) }, [setId])

  // Study keyboard shortcuts. The handler is reassigned on every render of the session, so it always
  // sees the current card; the listener itself is added once.
  const studyKeys = useRef<((e: KeyboardEvent) => void) | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘Z / Ctrl+Z undo like Z; other shortcuts with modifiers are left to the browser
      const undoCombo = (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z'
      if (e.repeat || ((e.metaKey || e.ctrlKey || e.altKey) && !undoCombo)) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      studyKeys.current?.(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (phase !== 'view') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setViewIndex(i => Math.min(i + 1, viewCards.length - 1))
      else if (e.key === 'ArrowLeft') setViewIndex(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, viewCards.length])

  async function syncPending() {
    if (!store.remote || !navigator.onLine) return
    for (const r of getPendingReviews()) {
      try { await store.logReview(r); removePendingReview(r.id) } catch {}
    }
    for (const u of getPendingUpdates().filter(p => p.setId === setId)) {
      try {
        await store.saveProgress(u.cardId, {
          due:            u.due,
          stability:      u.stability,
          difficulty:     u.difficulty,
          elapsed_days:   u.elapsedDays,
          scheduled_days: u.scheduledDays,
          reps:           u.reps,
          lapses:         u.lapses,
          learning_steps: u.learningSteps,
          fsrs_state:     u.fsrsState as FSRSState,
          last_review:    u.lastReview,
          status:         u.status,
          correct_count:  u.correctCount,
          last_reviewed:  u.lastReviewed,
          ...(u.suspended   !== undefined && { suspended:    u.suspended }),
          ...(u.buriedUntil !== undefined && { buried_until: u.buriedUntil }),
        }, u.ord ?? 0)
        removePendingUpdate(u.cardId, u.ord ?? 0)
      } catch {}
    }
  }

  async function loadCards() {
    const cached = getCachedCards(setId)
    let cards: FlashcardWithProgress[] = cached

    if (!store.remote || navigator.onLine) {
      try {
        // The set's target retention, or the user's default, with their FSRS parameters
        const [settings, set] = await Promise.all([loadSettings(), store.getSet(setId).catch(() => null)])
        fsrsRef.current = scheduler(retentionFor(set, settings), settings)
        cards = await store.getCards(setId)
        cacheCards(setId, cards)
      } catch { setIsOffline(true) }
    } else {
      setIsOffline(true)
    }

    const todayCount = getTodayNewCount(setId)
    const { dailyNewLimit } = getSetSettings(setId)
    const remaining = Math.max(0, dailyNewLimit - todayCount)
    // Each direction of a reversed card is studied (and counted) on its own
    const items = toItems(cards)
    const { dueCount: d, newCount: n } = buildQueue(items, 'ordered', new Map(), remaining)

    setAllCards(cards)
    setDueCount(d)
    setNewCount(n)
    setTodayNewCount(todayCount)
    setDailyLimit(dailyNewLimit)
    setSavedSession(getSavedSession(setId))

    // ── Custom study stats (suspended and buried cards never come up) ────────────
    const now = new Date()
    const available = items.filter(c => isAvailable(c.progress, now))
    setAheadCounts([1, 3, 7].map(days => ({
      days,
      count: available.filter(c => {
        const p = c.progress
        if (!p || (p.fsrs_state ?? 0) === 0) return false
        const due = new Date(p.due)
        return due > now && due <= new Date(now.getTime() + days * 86400000)
      }).length,
    })))
    setForgottenCount(available.filter(c => (c.progress?.lapses ?? 0) > 0).length)
    setStateCounts({
      new:          available.filter(c => isNew(c.progress)).length,
      learning:     available.filter(c => c.progress?.status === 'learning').length,
      needs_review: available.filter(c => c.progress?.status === 'needs_review').length,
      mastered:     available.filter(c => c.progress?.status === 'mastered').length,
    })
    setExtraNewCount(Math.max(0, available.filter(c => isNew(c.progress)).length - n))

    const viewMode = new URLSearchParams(window.location.search).get('mode') === 'view'
    setPhase(cards.length === 0 ? 'done' : viewMode ? 'view' : 'pre-session')
  }

  // ── Custom queue builders ─────────────────────────────────────────────────

  function getCustomQueue(mode: CustomMode, param?: number | string): StudyItem[] {
    const now = new Date()
    const pool = toItems(allCards).filter(c => isAvailable(c.progress, now))
    switch (mode) {
      case 'ahead': {
        const days = param as number
        const cutoff = new Date(now.getTime() + days * 86400000)
        return [...pool]
          .filter(c => {
            const p = c.progress
            if (!p || (p.fsrs_state ?? 0) === 0) return false
            const due = new Date(p.due)
            return due > now && due <= cutoff
          })
          .sort((a, b) => new Date(a.progress!.due).getTime() - new Date(b.progress!.due).getTime())
      }
      case 'more_new': {
        const n = param as number
        return pool.filter(c => isNew(c.progress)).slice(newCount, newCount + n)
      }
      case 'forgotten': {
        return [...pool]
          .filter(c => (c.progress?.lapses ?? 0) > 0)
          .sort((a, b) => (b.progress?.lapses ?? 0) - (a.progress?.lapses ?? 0))
      }
      case 'by_state': {
        const s = param as string
        if (s === 'new') return pool.filter(c => isNew(c.progress))
        return pool.filter(c => (c.progress?.status ?? 'new') === s)
      }
    }
  }

  // A fresh card face: front showing, nothing answered
  function resetCardUI() {
    setFlipState('front')
    setShowBack(false)
    setRevealed(false)
    setSelectedOption(null)
    setTyped(null)
    setMatchMisses(null)
    setCardMinHeight(null)
    setScheduling(null)
  }

  function beginSession() {
    undoStack.current = []
    setUndoCount(0)
    setToast(null)
    resetCardUI()
    setCardKey(0)
    sessionStart.current = Date.now()
    setPhase('session')
  }

  function startCustom(mode: CustomMode, param?: number | string) {
    const q = getCustomQueue(mode, param)
    if (q.length === 0) return
    clearSavedSession(setId)
    countedNewIds.current = new Set()
    progressMap.current   = new Map()
    setTotalInSession(q.length)
    setQueue(q.map(c => ({ ...c, _key: 0 })))
    statsRef.current = { cardsStudied: 0, correctCount: 0, masteredCount: 0 }
    setDisplayStats({ cardsStudied: 0, correctCount: 0, masteredCount: 0 })
    beginSession()
  }

  // ── Regular session start ─────────────────────────────────────────────────

  function startSession(type: 'new' | 'continue') {
    progressMap.current = new Map()

    if (type === 'continue' && savedSession) {
      // Saved by item key ("<card id>" or "<card id>:<ord>")
      const itemMap = new Map(toItems(allCards).map(c => [itemKey(c), c]))
      const restored = savedSession.queueIds
        .map(key => itemMap.get(key)).filter(Boolean) as StudyItem[]
      const valid = restored.filter(c => !isCompleted(c.progress) && isAvailable(c.progress))
      setOrder(savedSession.order)
      setTotalInSession(valid.length + savedSession.stats.cardsStudied)
      setQueue(valid.map(c => ({ ...c, _key: 0 })))
      statsRef.current = { ...savedSession.stats }
      setDisplayStats({ ...savedSession.stats })
    } else {
      clearSavedSession(setId)
      countedNewIds.current = new Set()
      const remaining = Math.max(0, getSetSettings(setId).dailyNewLimit - getTodayNewCount(setId))
      const { queue: q } = buildQueue(toItems(allCards), order, progressMap.current, remaining)
      setTotalInSession(q.length)
      setQueue(q.map(c => ({ ...c, _key: 0 })))
      statsRef.current = { cardsStudied: 0, correctCount: 0, masteredCount: 0 }
      setDisplayStats({ cardsStudied: 0, correctCount: 0, masteredCount: 0 })
    }
    beginSession()
  }

  function isCompleted(p: CardProgress | null | undefined): boolean {
    if (!p) return false
    return !isDue(p) && !isNew(p)
  }

  async function handleExit() {
    if (queue.length > 0) {
      saveSessionState(setId, {
        queueIds: queue.map(itemKey),
        stats: statsRef.current,
        order,
        savedAt: new Date().toISOString(),
      })
    }
    if (statsRef.current.cardsStudied > 0) await persistSession()
    router.push(paths.set(setId))
  }

  async function persistSession() {
    const s = statsRef.current
    if (s.cardsStudied === 0 || (store.remote && !navigator.onLine)) return
    const duration = sessionStart.current > 0
      ? Math.round((Date.now() - sessionStart.current) / 1000)
      : null
    await store.recordSession(setId, {
      cards_studied: s.cardsStudied, correct_count: s.correctCount,
      mastered_count: s.masteredCount, duration_seconds: duration,
    }).catch(() => {})
  }

  // An item's progress as of now in this session
  const currentProgress = (c: StudyItem) => progressMap.current.get(itemKey(c)) ?? c.progress ?? null

  // Shows the other side. The first time, it reveals the answer: ratings appear and the intervals
  // are worked out. After that, Space or a tap flips back and forth.
  function triggerFlip() {
    if (flipState === 'flipping') return
    const toBack = !showBack
    // While the back shows, keep the front's height so a shorter answer doesn't shrink the card (a
    // longer one still grows it); back on the front, the card takes its own size again
    setCardMinHeight(toBack ? cardRef.current?.offsetHeight ?? null : null)
    haptic(20)
    setFlipState('flipping')
    setTimeout(() => {
      setShowBack(toBack)
      const card = queue[0]
      if (toBack && !revealed && card) {
        setScheduling(fsrsRef.current.repeat(progressToFSRS(currentProgress(card)), new Date()))
        setRevealed(true)
      }
    }, 150)
    setTimeout(() => setFlipState(toBack ? 'back' : 'front'), 300)
  }

  // Saves one direction's progress, or queues it while offline
  async function saveCardProgress(cardId: string, ord: number, p: CardProgress) {
    progressMap.current.set(progressKey(cardId, ord), p)
    updateCachedProgress(setId, cardId, p, ord)
    if (!store.remote || navigator.onLine) {
      try {
        const { id: _id, card_id: _cardId, ord: _ord, ...fields } = p
        await store.saveProgress(cardId, fields, ord)
        return
      } catch {}
    }
    queueProgressUpdate({
      cardId, setId, ord,
      correctCount:  p.correct_count,
      status:        p.status,
      lastReviewed:  p.last_reviewed ?? new Date().toISOString(),
      due:           p.due,
      stability:     p.stability,
      difficulty:    p.difficulty,
      elapsedDays:   p.elapsed_days,
      scheduledDays: p.scheduled_days,
      reps:          p.reps,
      lapses:        p.lapses,
      learningSteps: p.learning_steps,
      fsrsState:     p.fsrs_state,
      lastReview:    p.last_review ?? new Date().toISOString(),
      suspended:     p.suspended ?? false,
      buriedUntil:   p.buried_until ?? null,
    })
  }

  // Takes a direction back to having no progress (undoing its first review)
  async function clearCardProgress(cardId: string, ord: number) {
    progressMap.current.delete(progressKey(cardId, ord))
    updateCachedProgress(setId, cardId, null, ord)
    removePendingUpdate(cardId, ord)
    if (!store.remote || navigator.onLine) await store.resetProgress([cardId], ord).catch(() => {})
  }

  const restoreProgress = (cardId: string, ord: number, prev: CardProgress | null) =>
    prev ? saveCardProgress(cardId, ord, prev) : clearCardProgress(cardId, ord)

  async function saveReview(review: ReviewLog) {
    if (!store.remote || navigator.onLine) {
      try { await store.logReview(review); return } catch {}
    }
    queueReview(review)
  }

  function pushUndo(entry: UndoEntry) {
    undoStack.current.push(entry)
    // Enough to step back through a long session, without growing forever
    if (undoStack.current.length > 50) undoStack.current.shift()
    setUndoCount(undoStack.current.length)
  }

  // Moves on to the next card, or ends the session
  async function advance(newQueue: SessionCard[]) {
    if (newQueue.length === 0) {
      await persistSession()
      clearSavedSession(setId)
      setPhase('done')
      return
    }
    resetCardUI()
    setCardKey(k => k + 1)
    setQueue(newQueue)
  }

  async function rate(rating: SRSRating) {
    const card = queue[0]
    if (!card || busy.current) return
    busy.current = true
    haptic(30)

    const now = new Date()
    const key = itemKey(card)
    const current = currentProgress(card)

    const countedNew = isNew(current) && !countedNewIds.current.has(key)
    if (countedNew) {
      countedNewIds.current.add(key)
      incrementTodayNewCount(setId)
      setTodayNewCount(c => c + 1)
    }

    const result  = fsrsRef.current.repeat(progressToFSRS(current), now)
    const next    = result[rating].card
    const newStatus = deriveStatus(next)
    const becameMastered = newStatus === 'mastered' && (current?.status !== 'mastered')

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
      suspended:      false,
      buried_until:   null,
      ...(card.ord && { ord: card.ord }),
    }

    const review: ReviewLog = {
      id:                  crypto.randomUUID(),
      card_id:             card.id,
      ord:                 card.ord,
      set_id:              setId,
      rating,
      state:               (current?.fsrs_state ?? 0) as FSRSState,
      elapsed_days:        current?.last_review ? Math.max(0, (now.getTime() - new Date(current.last_review).getTime()) / 86_400_000) : 0,
      last_scheduled_days: current?.scheduled_days ?? 0,
      scheduled_days:      next.scheduled_days,
      stability:           next.stability,
      difficulty:          next.difficulty,
      review_ms:           Math.min(MAX_REVIEW_MS, now.getTime() - shownAt.current),
      reviewed_at:         now.toISOString(),
    }

    // The other direction of a reversed card waits until tomorrow (Anki's sibling burying), so the
    // answer you just saw isn't the next question
    const siblings = queue.slice(1).filter((c, i, all) =>
      c.id === card.id && c.ord !== card.ord && all.findIndex(o => itemKey(o) === itemKey(c)) === i)
    const until = nextStudyDay().toISOString()

    pushUndo({
      action: 'rate', cardId: card.id, ord: card.ord, prevProgress: current,
      siblings: siblings.map(s => ({ ord: s.ord, prev: currentProgress(s) })),
      prevQueue: queue, prevStats: { ...statsRef.current }, countedNew, reviewId: review.id,
    })

    const newStats = {
      cardsStudied:  statsRef.current.cardsStudied  + 1,
      correctCount:  statsRef.current.correctCount  + (rating >= Rating.Good ? 1 : 0),
      masteredCount: statsRef.current.masteredCount + (becameMastered ? 1 : 0),
    }
    statsRef.current = newStats
    setDisplayStats({ ...newStats })

    const updatedCard: SessionCard = { ...card, progress: newProgress, _key: card._key + 1 }
    const rest = queue.slice(1).filter(c => !(c.id === card.id && c.ord !== card.ord))
    const newQueue = rating === Rating.Again ? [...rest, updatedCard] : rest
    if (siblings.length) setTotalInSession(t => t - siblings.length)

    try {
      await Promise.all([
        saveCardProgress(card.id, card.ord, newProgress),
        saveReview(review),
        ...siblings.map(s => saveCardProgress(card.id, s.ord, { ...(currentProgress(s) ?? emptyProgress(card.id, s.ord)), buried_until: until })),
      ])
      await advance(newQueue)
    } finally {
      busy.current = false
    }
  }

  // Bury: back at the start of the next study day. Suspend: until unsuspended from the card list.
  // Either way the card leaves this session.
  async function setAside(action: 'bury' | 'suspend') {
    const card = queue[0]
    if (!card || busy.current) return
    busy.current = true
    haptic(20)
    const current = currentProgress(card)
    const base = current ?? emptyProgress(card.id, card.ord)
    const p: CardProgress = action === 'bury'
      ? { ...base, buried_until: nextStudyDay().toISOString() }
      : { ...base, suspended: true }
    pushUndo({ action, cardId: card.id, ord: card.ord, prevProgress: current, siblings: [], prevQueue: queue, prevStats: { ...statsRef.current }, countedNew: false, reviewId: null })
    setTotalInSession(t => t - 1)
    try {
      await saveCardProgress(card.id, card.ord, p)
      setToast({
        id: Date.now(),
        message: action === 'bury' ? 'Card buried until tomorrow' : 'Card suspended. Unsuspend it from the set’s card list.',
        onUndo: undo,
      })
      await advance(queue.filter(c => itemKey(c) !== itemKey(card)))
    } finally {
      busy.current = false
    }
  }

  // Steps back one rating, bury or suspend: the card's progress and the session return to how they
  // were, and the card is in front of you again
  async function undo() {
    const entry = undoStack.current.pop()
    if (!entry || busy.current) return
    busy.current = true
    setUndoCount(undoStack.current.length)
    haptic(20)
    try {
      await restoreProgress(entry.cardId, entry.ord, entry.prevProgress)
      for (const s of entry.siblings) await restoreProgress(entry.cardId, s.ord, s.prev)
      if (entry.reviewId) {
        removePendingReview(entry.reviewId)
        if (!store.remote || navigator.onLine) await store.deleteReview(entry.reviewId).catch(() => {})
      }
      if (entry.countedNew) {
        countedNewIds.current.delete(progressKey(entry.cardId, entry.ord))
        decrementTodayNewCount(setId)
        setTodayNewCount(c => Math.max(0, c - 1))
      }
      if (entry.action !== 'rate') setTotalInSession(t => t + 1)
      if (entry.siblings.length) setTotalInSession(t => t + entry.siblings.length)
      statsRef.current = entry.prevStats
      setDisplayStats({ ...entry.prevStats })
      resetCardUI()
      setCardKey(k => k + 1)
      setQueue(entry.prevQueue)
      setPhase('session')
      setToast({ id: Date.now(), message: entry.action === 'rate' ? 'Rating undone' : entry.action === 'bury' ? 'Unburied' : 'Unsuspended' })
    } finally {
      busy.current = false
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
              { val: `${pct}%`,      label: 'Correct'  },
              { val: s.masteredCount, label: 'Matured' },
            ].map(({ val, label }) => (
              <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{val}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">{label}</div>
              </div>
            ))}
          </div>
          <Link href={paths.set(setId)} className="block w-full bg-indigo-600 text-white px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors">
            Back to Set
          </Link>
        </div>
      </div>
    )
  }

  // ── View mode ──────────────────────────────────────────────────────────────
  if (phase === 'view') {
    const viewCard = viewCards[viewIndex]
    const atEnd    = viewIndex >= viewCards.length - 1
    return (
      <div className="max-w-lg lg:max-w-3xl mx-auto px-4 py-6 lg:py-10">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => router.push(paths.set(setId))} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors font-medium">
            ← Exit
          </button>
          <p className="text-sm text-gray-400 dark:text-gray-500">{viewIndex + 1} / {viewCards.length}</p>
          <span className="w-12 text-right text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">View</span>
        </div>

        {/* Scrubber: drag (or tap) anywhere along it to jump to a card */}
        <input
          type="range"
          min={0}
          max={Math.max(viewCards.length - 1, 0)}
          value={viewIndex}
          onChange={e => setViewIndex(Number(e.target.value))}
          disabled={viewCards.length < 2}
          aria-label="Jump to card"
          className="scrubber w-full mb-5"
          style={{ '--fill': `${viewCards.length > 1 ? (viewIndex / (viewCards.length - 1)) * 100 : 100}%` } as React.CSSProperties}
        />

        <div className="mb-5">
          <FlipCard key={viewCard.id} card={viewCard} />
        </div>

        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          Viewing only — doesn&apos;t affect your stats or schedule
          <span className="hidden lg:inline"> · ← → to move between cards</span>
        </p>
        <BottomBarSpacer />

        <BottomBar>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setViewIndex(i => i - 1)}
              disabled={viewIndex === 0}
              className="py-4 rounded-2xl font-semibold text-base bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={() => (atEnd ? router.push(paths.set(setId)) : setViewIndex(i => i + 1))}
              className="py-4 rounded-2xl font-semibold text-base bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
            >
              {atEnd ? 'Finish' : 'Next →'}
            </button>
          </div>
        </BottomBar>
      </div>
    )
  }

  // ── Pre-session ────────────────────────────────────────────────────────────
  if (phase === 'pre-session') {
    const totalToStudy   = dueCount + newCount
    const nothing        = totalToStudy === 0
    const limitReached   = todayNewCount >= dailyLimit
    const remainingToday = Math.max(0, dailyLimit - todayNewCount)

    // Batches for "more new cards": [10, 20, 50, all] deduplicated and capped
    const newBatches = Array.from(
      new Set([10, 20, 50, extraNewCount].filter(n => n > 0 && n <= extraNewCount))
    ).sort((a, b) => a - b).slice(0, 4)

    const customVisible = nothing || showCustom

    return (
      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link href={paths.set(setId)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors">←</Link>
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

        {/* Order toggle + start buttons (regular session) */}
        {!nothing && (
          <>
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

            <div className="space-y-3 mb-5">
              {savedSession && (
                <button onClick={() => startSession('continue')}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
                >
                  Continue ({savedSession.queueIds.length} remaining)
                </button>
              )}
              <button onClick={() => startSession('new')}
                className={`w-full py-4 rounded-2xl font-semibold text-base transition-colors ${
                  savedSession
                    ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm'
                }`}
              >
                {savedSession ? 'Start New Session' : `Study Now — ${totalToStudy} card${totalToStudy !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}

        {/* ── Custom Study ──────────────────────────────────────────────── */}
        {!nothing && (
          <button
            onClick={() => setShowCustom(v => !v)}
            className="w-full flex items-center justify-between text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors py-1 mb-3"
          >
            <span className="font-semibold uppercase tracking-wider text-xs">Custom Study</span>
            <svg
              width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
              className={`transition-transform ${showCustom ? 'rotate-180' : ''}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {customVisible && (
          <div className="space-y-3 pb-6">

            {/* Study Ahead */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-700/50">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Study Ahead</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Review cards before they&apos;re due, sorted by soonest first</p>
              </div>
              <div className="flex divide-x divide-gray-100 dark:divide-gray-700">
                {aheadCounts.map(({ days, count }) => (
                  <button
                    key={days}
                    onClick={() => startCustom('ahead', days)}
                    disabled={count === 0}
                    className="flex-1 py-3.5 text-center transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <div className={`text-lg font-bold ${count > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`}>{count}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{days === 1 ? '1 day' : `${days} days`}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* More New Cards */}
            {extraNewCount > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-700/50">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">More New Cards</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{extraNewCount} unintroduced card{extraNewCount !== 1 ? 's' : ''} available</p>
                </div>
                <div className="flex divide-x divide-gray-100 dark:divide-gray-700">
                  {newBatches.map(n => (
                    <button
                      key={n}
                      onClick={() => startCustom('more_new', n)}
                      className="flex-1 py-3.5 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">+{n}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">cards</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Forgotten Cards */}
            {forgottenCount > 0 && (
              <button
                onClick={() => startCustom('forgotten')}
                className="w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Forgotten Cards</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Cards you&apos;ve missed — sorted by most lapses</p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <span className="text-lg font-bold text-orange-500 dark:text-orange-400">{forgottenCount}</span>
                  <p className="text-xs text-gray-400 dark:text-gray-500">cards</p>
                </div>
              </button>
            )}

            {/* Review by State */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-700/50">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Review by State</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Study all cards in a specific FSRS state</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 dark:divide-gray-700">
                {([
                  { key: 'new',          label: 'New',      count: stateCounts.new,          color: 'text-blue-600 dark:text-blue-400'   },
                  { key: 'learning',     label: 'Learning', count: stateCounts.learning,     color: 'text-yellow-600 dark:text-yellow-400' },
                  { key: 'needs_review', label: 'Review',   count: stateCounts.needs_review, color: 'text-orange-600 dark:text-orange-400' },
                  { key: 'mastered',     label: 'Mature',   count: stateCounts.mastered,     color: 'text-green-600 dark:text-green-400'  },
                ] as const).map(({ key, label, count, color }) => (
                  <button
                    key={key}
                    onClick={() => startCustom('by_state', key)}
                    disabled={count === 0}
                    className="py-3.5 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <div className={`text-lg font-bold ${color}`}>{count}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{label}</div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    )
  }

  // ── Session ────────────────────────────────────────────────────────────────
  const card = queue[0]
  // A reversed card's back-to-front direction swaps the faces
  const face = cardFace(card, card.ord)
  const done = totalInSession - queue.length
  const cardNumber = done + 1
  const progressPct = totalInSession > 0 ? (done / totalInSession) * 100 : 0
  const isCorrectSelection = selectedOption !== null && selectedOption === face.answer
  // Hint toward Again after an auto-checked miss. Only the rating the user taps is recorded.
  const answeredWrong = typed?.result === 'incorrect' || (selectedOption !== null && !isCorrectSelection)
  const cardAnimClass = flipState === 'flipping' ? 'card-flip' : ''
  // Tapping flips cards with nothing to answer on the front (others have inputs there); once
  // revealed, every card's back flips to the front with a tap
  const tapFlips = card.type === 'open_ended' || card.type === 'fill_blank' || showBack

  const intervals = scheduling ? {
    again: formatInterval(scheduling[Rating.Again].card),
    hard:  formatInterval(scheduling[Rating.Hard].card),
    good:  formatInterval(scheduling[Rating.Good].card),
    easy:  formatInterval(scheduling[Rating.Easy].card),
  } : null

  // Space/Enter reveals, then Space flips back and forth; 1–4 rate; A–D pick a multiple-choice option;
  // T/F answer true/false; Z (or ⌘Z/Ctrl+Z) undoes, - buries, @ suspends (Anki's keys)
  studyKeys.current = e => {
    const key = e.key.toLowerCase()
    if (key === 'z') { e.preventDefault(); undo(); return }
    if (key === 'r') { e.preventDefault(); playSide(showBack); return }
    if (e.key === '-') { e.preventDefault(); setAside('bury'); return }
    if (e.key === '@') { e.preventDefault(); setAside('suspend'); return }
    if (revealed) {
      const rating = ({ '1': Rating.Again, '2': Rating.Hard, '3': Rating.Good, '4': Rating.Easy } as Record<string, SRSRating>)[key]
      if (rating !== undefined) { e.preventDefault(); rate(rating) }
      else if (key === ' ') { e.preventDefault(); triggerFlip() }
      return
    }
    if (flipState !== 'front') return
    if ((key === ' ' || key === 'enter') && (card.type === 'open_ended' || card.type === 'fill_blank')) {
      e.preventDefault()
      triggerFlip()
    } else if (card.type === 'multiple_choice' && face.options) {
      const opt = face.options['abcdefghij'.indexOf(key)] ?? face.options[Number(key) - 1]
      if (key.length === 1 && opt !== undefined) { e.preventDefault(); setSelectedOption(opt); triggerFlip() }
    } else if (card.type === 'true_false' && (key === 't' || key === 'f')) {
      e.preventDefault()
      setSelectedOption(key === 't' ? 'True' : 'False')
      triggerFlip()
    }
  }

  return (
    <div className="max-w-lg lg:max-w-3xl mx-auto px-4 py-6 lg:py-10">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={handleExit} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors font-medium flex-shrink-0">
          ← Exit
        </button>
        <p className="flex-1 text-center text-sm text-gray-400 dark:text-gray-500 tabular-nums">{cardNumber} / {totalInSession}</p>
        <div className="flex items-center flex-shrink-0">
          <StudyAction icon={Undo2}  label="Undo"    kbd="Z" onClick={undo} disabled={undoCount === 0} />
          <StudyAction icon={EyeOff} label="Bury"    kbd="-" onClick={() => setAside('bury')}    title="Hide until tomorrow" />
          <StudyAction icon={Ban}    label="Suspend" kbd="@" onClick={() => setAside('suspend')} title="Hide until you unsuspend it" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full mb-5 overflow-hidden">
        <div className="h-2 bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Card */}
      <div
        key={cardKey}
        ref={cardRef}
        // The enter animation plays only when the card first appears, not when flipping back to the front
        className={`${flipState === 'front' && !revealed ? 'card-enter' : ''} bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 p-6 lg:p-10 mb-5 min-h-[220px] lg:min-h-[340px] flex flex-col ${cardAnimClass}`}
        onClick={tapFlips ? () => { if (!hasTextSelection()) triggerFlip() } : undefined}
        style={{
          cursor: tapFlips ? 'pointer' : 'default',
          minHeight: cardMinHeight ?? undefined,
        }}
      >
        {!showBack ? (
          <div className="flex flex-col flex-1">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
              {card.type === 'multiple_choice' ? 'Multiple Choice'
               : card.type === 'fill_blank'   ? 'Fill in the blank'
               : card.type === 'typed'        ? 'Type the answer'
               : card.type === 'true_false'   ? 'True or false?'
               : card.type === 'matching'     ? 'Matching'
               : revealed ? 'Question' : 'Tap to reveal answer'}
            </p>
            {card.type === 'fill_blank'
              ? <ClozeQuestion sentence={face.question} />
              : <ContentRenderer
                  text={card.type === 'matching' && !face.question.trim() ? 'Match the pairs' : face.question}
                  className={`${card.type === 'matching' ? 'text-base' : 'text-xl lg:text-2xl flex-1'} font-medium text-gray-900 dark:text-gray-100 leading-relaxed`}
                  readOnly
                />
            }
            {card.type === 'typed' && (
              <TypedAnswerInput
                onSubmit={input => {
                  const result = checkTypedAnswer(input, face.answer, face.options)
                  haptic(result === 'incorrect' ? 60 : 20)
                  setTyped({ input, result })
                  triggerFlip()
                }}
              />
            )}
            {card.type === 'true_false' && (
              <TrueFalseButtons onPick={v => { setSelectedOption(v); triggerFlip() }} />
            )}
            {card.type === 'matching' && card.pairs && (
              <MatchingBoard pairs={card.pairs} onDone={misses => { setMatchMisses(misses); triggerFlip() }} />
            )}
            {card.type === 'multiple_choice' && face.options && (
              <div className="mt-5 space-y-2">
                {face.options.map((opt, i) => (
                  <button key={i}
                    onClick={e => { e.stopPropagation(); haptic(20); setSelectedOption(opt); triggerFlip() }}
                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors font-medium"
                  >
                    <span className="text-gray-400 dark:text-gray-500 mr-2">{String.fromCharCode(65 + i)}.</span>
                    <ContentRenderer text={opt} readOnly />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col flex-1">
            {card.type === 'fill_blank' ? (
              <div className="flex flex-col flex-1">
                <p className="text-xs font-medium text-indigo-400 uppercase tracking-wide mb-3">Answer</p>
                <ClozeQuestion sentence={face.question} answer={face.answer} />
              </div>
            ) : card.type === 'matching' ? (
              <div className="flex flex-col flex-1">
                {matchMisses !== null && (
                  <div className={`mb-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
                    matchMisses === 0
                      ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  }`}>
                    {matchMisses === 0 ? '✓ All matched, no misses!' : `Matched with ${matchMisses} miss${matchMisses !== 1 ? 'es' : ''}`}
                  </div>
                )}
                <p className="text-xs font-medium text-indigo-400 uppercase tracking-wide mb-2">Pairs</p>
                <MatchingPairsList pairs={card.pairs ?? []} />
              </div>
            ) : (
              <>
                <div className="mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Question</p>
                  <ContentRenderer text={face.question} className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed" readOnly />
                </div>
                <div className="flex flex-col flex-1">
                  <p className="text-xs font-medium text-indigo-400 uppercase tracking-wide mb-2">Answer</p>
                  {card.type === 'typed' && typed && <TypedResultBanner input={typed.input} result={typed.result} />}
                  {(card.type === 'multiple_choice' || card.type === 'true_false') && selectedOption && (
                    <div className={`flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
                      isCorrectSelection
                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    }`}>
                      {isCorrectSelection ? '✓ Correct!' : `✗ Incorrect — you picked: ${previewText(selectedOption)}`}
                    </div>
                  )}
                  <ContentRenderer text={face.answer} className="text-xl lg:text-2xl font-medium text-gray-900 dark:text-gray-100 leading-relaxed flex-1" readOnly />
                  {card.type === 'typed' && face.options && face.options.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Also accepted: {face.options.join(', ')}</p>
                  )}
                  {card.type === 'multiple_choice' && face.options && (
                    <div className="mt-4 space-y-1.5">
                      {face.options.map((opt, i) => {
                        const isCorrect  = opt === face.answer
                        const isSelected = opt === selectedOption
                        return (
                          <div key={i} className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${
                            isCorrect  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium border border-green-200 dark:border-green-800'
                            : isSelected ? 'bg-red-50 dark:bg-red-900/20 text-red-400 dark:text-red-500 line-through border border-red-100 dark:border-red-900'
                            : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            <span>{String.fromCharCode(65 + i)}.</span>
                            <ContentRenderer text={opt} readOnly />
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

      <BottomBarSpacer />

      {/* Actions, pinned to the bottom so they're in thumb reach and don't move as cards change size */}
      <UndoToast toast={toast} onDismiss={() => setToast(null)} raised />

      <BottomBar>
      {revealed ? (
        <div className="grid grid-cols-4 gap-2 fade-in">
          <button onClick={() => rate(Rating.Again)}
            className={`flex flex-col items-center py-3.5 rounded-2xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 active:bg-red-200 transition-colors border border-red-100 dark:border-red-900 ${
              answeredWrong ? 'ring-2 ring-red-400 ring-offset-2 dark:ring-offset-gray-900' : ''
            }`}
          >
            <span className="text-base font-semibold">Again<Kbd>1</Kbd></span>
            {intervals && <span className="text-xs text-red-400 dark:text-red-500 mt-0.5">{intervals.again}</span>}
          </button>
          <button onClick={() => rate(Rating.Hard)}
            className="flex flex-col items-center py-3.5 rounded-2xl bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 active:bg-orange-200 transition-colors border border-orange-100 dark:border-orange-900"
          >
            <span className="text-base font-semibold">Hard<Kbd>2</Kbd></span>
            {intervals && <span className="text-xs text-orange-400 dark:text-orange-500 mt-0.5">{intervals.hard}</span>}
          </button>
          <button onClick={() => rate(Rating.Good)}
            className="flex flex-col items-center py-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 active:bg-indigo-200 transition-colors border border-indigo-100 dark:border-indigo-900"
          >
            <span className="text-base font-semibold">Good<Kbd>3</Kbd></span>
            {intervals && <span className="text-xs text-indigo-400 dark:text-indigo-500 mt-0.5">{intervals.good}</span>}
          </button>
          <button onClick={() => rate(Rating.Easy)}
            className="flex flex-col items-center py-3.5 rounded-2xl bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 active:bg-green-200 transition-colors border border-green-100 dark:border-green-900"
          >
            <span className="text-base font-semibold">Easy<Kbd>4</Kbd></span>
            {intervals && <span className="text-xs text-green-400 dark:text-green-500 mt-0.5">{intervals.easy}</span>}
          </button>
        </div>
      ) : (
        (card.type === 'open_ended' || card.type === 'fill_blank') && (
          <button onClick={triggerFlip}
            className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            Show Answer<Kbd light>Space</Kbd>
          </button>
        )
      )}
      </BottomBar>
    </div>
  )
}

// A small labeled button in the study header (Undo, Bury, Suspend)
function StudyAction({ icon: Icon, label, kbd, onClick, disabled, title }: {
  icon: LucideIcon; label: string; kbd: string; onClick: () => void; disabled?: boolean; title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ? `${title} (${kbd})` : `${label} (${kbd})`}
      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 hover:bg-gray-100 dark:hover:text-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
    >
      <Icon size={15} />
      {label}
      <Kbd>{kbd}</Kbd>
    </button>
  )
}

// Keyboard shortcut hint, desktop only (phones have no keyboard)
function Kbd({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <kbd className={`hidden lg:inline-block ml-2 align-middle px-1.5 py-px rounded border font-sans text-[11px] font-medium leading-4 ${
      light ? 'border-white/30 text-white/80' : 'border-current opacity-50'
    }`}>
      {children}
    </kbd>
  )
}
