import type { FlashcardWithProgress, CardProgress, CardStatus, FlashcardSet } from './types'

const K = {
  cards: (setId: string) => `fc_cards_${setId}`,
  sets: 'fc_sets_v1',
  pending: 'fc_pending_v1',
}

// --- Sets cache (for home page) ---

export function cacheSets(sets: object[]) {
  try { localStorage.setItem(K.sets, JSON.stringify(sets)) } catch {}
}

export function getCachedSets(): FlashcardSet[] {
  try { return JSON.parse(localStorage.getItem(K.sets) ?? '[]') } catch { return [] }
}

// --- Cards cache (per set, with progress) ---

export function cacheCards(setId: string, cards: FlashcardWithProgress[]) {
  try { localStorage.setItem(K.cards(setId), JSON.stringify(cards)) } catch {}
}

export function getCachedCards(setId: string): FlashcardWithProgress[] {
  try { return JSON.parse(localStorage.getItem(K.cards(setId)) ?? '[]') } catch { return [] }
}

export function updateCachedProgress(setId: string, cardId: string, progress: CardProgress) {
  const cards = getCachedCards(setId)
  cacheCards(
    setId,
    cards.map((c) => (c.id === cardId ? { ...c, progress } : c))
  )
}

// --- Offline sync queue ---

export interface PendingProgressUpdate {
  cardId: string
  setId: string
  correctCount: number
  status: CardStatus
  lastReviewed: string
  existingProgressId: string | null
}

export function queueProgressUpdate(update: PendingProgressUpdate) {
  try {
    const current = getPendingUpdates().filter((p) => p.cardId !== update.cardId)
    localStorage.setItem(K.pending, JSON.stringify([...current, update]))
  } catch {}
}

export function getPendingUpdates(): PendingProgressUpdate[] {
  try { return JSON.parse(localStorage.getItem(K.pending) ?? '[]') } catch { return [] }
}

export function removePendingUpdate(cardId: string) {
  try {
    const updated = getPendingUpdates().filter((p) => p.cardId !== cardId)
    localStorage.setItem(K.pending, JSON.stringify(updated))
  } catch {}
}
