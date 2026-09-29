import type { FlashcardWithProgress, CardProgress, CardStatus, FlashcardSet } from './types'

const K = {
  cards:   (setId: string) => `fc_cards_${setId}`,
  sets:    'fc_sets_v1',
  pending: 'fc_pending_v1',
  session: (setId: string) => `fc_session_${setId}`,
}

// ── Sets cache ────────────────────────────────────────────────────────────────

export function cacheSets(sets: object[]) {
  try { localStorage.setItem(K.sets, JSON.stringify(sets)) } catch {}
}

export function getCachedSets(): FlashcardSet[] {
  try { return JSON.parse(localStorage.getItem(K.sets) ?? '[]') } catch { return [] }
}

// ── Cards cache (per set, with progress) ─────────────────────────────────────

export function cacheCards(setId: string, cards: FlashcardWithProgress[]) {
  try { localStorage.setItem(K.cards(setId), JSON.stringify(cards)) } catch {}
}

export function getCachedCards(setId: string): FlashcardWithProgress[] {
  try { return JSON.parse(localStorage.getItem(K.cards(setId)) ?? '[]') } catch { return [] }
}

export function updateCachedProgress(setId: string, cardId: string, progress: CardProgress) {
  const cards = getCachedCards(setId)
  cacheCards(setId, cards.map(c => (c.id === cardId ? { ...c, progress } : c)))
}

// ── Offline sync queue ────────────────────────────────────────────────────────

export interface PendingProgressUpdate {
  cardId: string
  setId: string
  // legacy
  correctCount: number
  status: CardStatus
  lastReviewed: string
  existingProgressId: string | null
  // FSRS
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
}

export function queueProgressUpdate(update: PendingProgressUpdate) {
  try {
    const current = getPendingUpdates().filter(p => p.cardId !== update.cardId)
    localStorage.setItem(K.pending, JSON.stringify([...current, update]))
  } catch {}
}

export function getPendingUpdates(): PendingProgressUpdate[] {
  try { return JSON.parse(localStorage.getItem(K.pending) ?? '[]') } catch { return [] }
}

export function removePendingUpdate(cardId: string) {
  try {
    localStorage.setItem(K.pending, JSON.stringify(getPendingUpdates().filter(p => p.cardId !== cardId)))
  } catch {}
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
    // Expire after 24 hours
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
