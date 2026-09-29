export type CardType = 'multiple_choice' | 'open_ended'
export type CardStatus = 'new' | 'learning' | 'mastered' | 'needs_review'

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
  created_at: string
}

export interface CardProgress {
  id: string
  card_id: string
  correct_count: number
  status: CardStatus
  last_reviewed: string | null
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
