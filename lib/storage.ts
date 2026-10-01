import type { FlashcardWithProgress, CardProgress, CardStatus, FlashcardSet, SetStudyStats, Collection, ReviewLog } from './types'
import { studyDayKey } from './day'

const K = {
  cards:    (setId: string) => `fc_cards_${setId}`,
  sets:     'fc_sets_v2',   // bumped so old stat-less cache is ignored
  collections: 'fc_collections_v1',
  stats:    (setId: string) => `fc_stats_${setId}`,
  pending:  'fc_pending_v1',
  pendingReviews: 'fc_pending_reviews_v1',
  session:  (setId: string) => `fc_session_${setId}`,
  settings: (setId: string) => `fc_settings_${setId}`,
}

// ── Sets cache (stores full stats so home page works offline) ─────────────────

export function cacheSets(sets: object[]) {
  try { localStorage.setItem(K.sets, JSON.stringify(sets)) } catch {}
}

export function getCachedSets(): (FlashcardSet & {
  totalCards: number; toStudy: number; lastStudied: string | null; totalSessions: number
})[] {
  try { return JSON.parse(localStorage.getItem(K.sets) ?? '[]') } catch { return [] }
}

// ── Collections cache ─────────────────────────────────────────────────────────

// Fired after the collections cache changes, so the desktop sidebar's list stays current
export const COLLECTIONS_EVENT = 'fc:collections'

export function cacheCollections(collections: Collection[]) {
  try { localStorage.setItem(K.collections, JSON.stringify(collections)) } catch {}
  try { window.dispatchEvent(new Event(COLLECTIONS_EVENT)) } catch {}
}

export function getCachedCollections(): Collection[] {
  try { return JSON.parse(localStorage.getItem(K.collections) ?? '[]') } catch { return [] }
}

// ── Cards cache (per set, with progress) ─────────────────────────────────────

export function cacheCards(setId: string, cards: FlashcardWithProgress[]) {
  try { localStorage.setItem(K.cards(setId), JSON.stringify(cards)) } catch {}
}

export function getCachedCards(setId: string): FlashcardWithProgress[] {
  try { return JSON.parse(localStorage.getItem(K.cards(setId)) ?? '[]') } catch { return [] }
}

// ord: the direction (1 = a reversed card's back to front)
export function updateCachedProgress(setId: string, cardId: string, progress: CardProgress | null, ord = 0) {
  const cards = getCachedCards(setId)
  cacheCards(setId, cards.map(c => {
    if (c.id !== cardId) return c
    if (ord === 0) return { ...c, progress }
    const extra = { ...(c.extraProgress ?? {}) }
    if (progress) extra[ord] = progress
    else delete extra[ord]
    return { ...c, extraProgress: extra }
  }))
}

// ── Study stats cache (per set) ───────────────────────────────────────────────

export function cacheSetStats(setId: string, stats: SetStudyStats | null) {
  try { localStorage.setItem(K.stats(setId), JSON.stringify(stats)) } catch {}
}

export function getCachedSetStats(setId: string): SetStudyStats | null {
  try { return JSON.parse(localStorage.getItem(K.stats(setId)) ?? 'null') } catch { return null }
}

// ── Per-set settings ──────────────────────────────────────────────────────────

export interface SetSettings {
  dailyNewLimit: number
}

const DEFAULT_SETTINGS: SetSettings = { dailyNewLimit: 20 }

export function getSetSettings(setId: string): SetSettings {
  try {
    const raw = localStorage.getItem(K.settings(setId))
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as SetSettings
  } catch { return { ...DEFAULT_SETTINGS } }
}

export function saveSetSettings(setId: string, settings: SetSettings) {
  try { localStorage.setItem(K.settings(setId), JSON.stringify(settings)) } catch {}
}

// ── Offline sync queue ────────────────────────────────────────────────────────

export interface PendingProgressUpdate {
  cardId: string
  setId: string
  correctCount: number
  status: CardStatus
  lastReviewed: string
  due: string
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  learningSteps: number
  fsrsState: number
  lastReview: string
  suspended?: boolean
  buriedUntil?: string | null
  // The direction (missing = 0)
  ord?: number
}

export function queueProgressUpdate(update: PendingProgressUpdate) {
  try {
    const current = getPendingUpdates().filter(p => p.cardId !== update.cardId || (p.ord ?? 0) !== (update.ord ?? 0))
    localStorage.setItem(K.pending, JSON.stringify([...current, update]))
  } catch {}
}

export function getPendingUpdates(): PendingProgressUpdate[] {
  try { return JSON.parse(localStorage.getItem(K.pending) ?? '[]') } catch { return [] }
}

export function removePendingUpdate(cardId: string, ord = 0) {
  try {
    localStorage.setItem(K.pending, JSON.stringify(getPendingUpdates().filter(p => p.cardId !== cardId || (p.ord ?? 0) !== ord)))
  } catch {}
}

// Reviews made offline, sent with the progress queue
export function queueReview(log: ReviewLog) {
  try { localStorage.setItem(K.pendingReviews, JSON.stringify([...getPendingReviews(), log])) } catch {}
}

export function getPendingReviews(): ReviewLog[] {
  try { return JSON.parse(localStorage.getItem(K.pendingReviews) ?? '[]') } catch { return [] }
}

export function removePendingReview(id: string) {
  try {
    localStorage.setItem(K.pendingReviews, JSON.stringify(getPendingReviews().filter(r => r.id !== id)))
  } catch {}
}

// ── Daily new-card quota (resets when the study day starts, 4 AM; per set) ────

const todayStr = () => studyDayKey()

export function getTodayNewCount(setId: string): number {
  try {
    const raw = localStorage.getItem(`fc_daily_${setId}`)
    if (!raw) return 0
    const { date, count } = JSON.parse(raw) as { date: string; count: number }
    return date === todayStr() ? count : 0
  } catch { return 0 }
}

export function incrementTodayNewCount(setId: string): void {
  try {
    const count = getTodayNewCount(setId) + 1
    localStorage.setItem(`fc_daily_${setId}`, JSON.stringify({ date: todayStr(), count }))
  } catch {}
}

export function decrementTodayNewCount(setId: string): void {
  try {
    const count = Math.max(0, getTodayNewCount(setId) - 1)
    localStorage.setItem(`fc_daily_${setId}`, JSON.stringify({ date: todayStr(), count }))
  } catch {}
}

export function resetTodayNewCount(setId: string): void {
  try { localStorage.removeItem(`fc_daily_${setId}`) } catch {}
}

// ── Session state (continue where you left off) ───────────────────────────────

export interface SavedSession {
  queueIds: string[]
  stats: { cardsStudied: number; correctCount: number; masteredCount: number }
  order: 'ordered' | 'random'
  savedAt: string
}

export function saveSessionState(setId: string, session: SavedSession) {
  try { localStorage.setItem(K.session(setId), JSON.stringify(session)) } catch {}
}

export function getSavedSession(setId: string): SavedSession | null {
  try {
    const raw = localStorage.getItem(K.session(setId))
    if (!raw) return null
    const s = JSON.parse(raw) as SavedSession
    if (Date.now() - new Date(s.savedAt).getTime() > 86400000) {
      clearSavedSession(setId)
      return null
    }
    return s
  } catch { return null }
}

export function clearSavedSession(setId: string) {
  try { localStorage.removeItem(K.session(setId)) } catch {}
}
