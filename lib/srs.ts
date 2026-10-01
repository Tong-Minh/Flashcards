// Converting stored progress to ts-fsrs cards, shared by study and stats
import { createEmptyCard, type Card as FSRSCard, type State } from 'ts-fsrs'
import type { CardProgress, CardType, Flashcard, FlashcardWithProgress } from '@/lib/types'

export function progressToFSRS(p: CardProgress | null | undefined): FSRSCard {
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

// Review cards with an interval of 21 days or more count as mature (Anki's threshold)
export const MATURE_DAYS = 21

// ── Card directions ──────────────────────────────────────────────────────────
// A reversed card is studied twice: front to back (ord 0) and back to front (ord 1), each with its
// own progress. Only open-ended and typed cards can be reversed.

export const canReverse = (type: CardType) => type === 'open_ended' || type === 'typed'

export function cardOrds(card: Pick<Flashcard, 'type' | 'reverse'>): number[] {
  return card.reverse && canReverse(card.type) ? [0, 1] : [0]
}

export function progressOf(card: FlashcardWithProgress, ord: number): CardProgress | null {
  return ord === 0 ? card.progress : card.extraProgress?.[ord] ?? null
}

// Where a direction's progress is kept in the desktop app's progress.json
export const progressKey = (cardId: string, ord = 0) => (ord ? `${cardId}:${ord}` : cardId)

// What a direction shows: the back to front swaps question and answer (a typed card's extra
// accepted answers belong to the original answer, so they're dropped)
export function cardFace<T extends Pick<Flashcard, 'question' | 'answer' | 'options'>>(card: T, ord: number): T {
  return ord === 1 ? { ...card, question: card.answer, answer: card.question, options: null } : card
}

// Every studyable direction of the cards, with its progress (stats count these, not cards)
export function studyItems(cards: FlashcardWithProgress[]): { card: FlashcardWithProgress; ord: number; progress: CardProgress | null }[] {
  return cards.flatMap(card => cardOrds(card).map(ord => ({ card, ord, progress: progressOf(card, ord) })))
}
