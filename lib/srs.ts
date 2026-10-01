// Converting stored progress to ts-fsrs cards, shared by study and stats
import { createEmptyCard, type Card as FSRSCard, type State } from 'ts-fsrs'
import type { CardProgress } from '@/lib/types'

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
