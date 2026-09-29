export type CardType   = 'multiple_choice' | 'open_ended' | 'fill_blank'
export type CardStatus = 'new' | 'learning' | 'mastered' | 'needs_review'
export type FSRSState  = 0 | 1 | 2 | 3 // New | Learning | Review | Relearning

export interface FlashcardSet {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface Flashcard {
  id: string
  set_id: string
  question: string
  type: CardType
  answer: string
  options: string[] | null
  position: number | null
  created_at: string
}

export interface CardProgress {
  id: string
  card_id: string
  correct_count: number
  status: CardStatus
  last_reviewed: string | null
  // FSRS fields
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  learning_steps: number
  fsrs_state: FSRSState
  last_review: string | null
}

export interface FlashcardWithProgress extends Flashcard {
  progress: CardProgress | null
}

export interface StudySession {
  id: string
  set_id: string
  cards_studied: number
  correct_count: number
  mastered_count: number
  completed_at: string
}
