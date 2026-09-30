export type CardType   = 'multiple_choice' | 'open_ended' | 'fill_blank' | 'typed' | 'true_false' | 'matching'
export type CardStatus = 'new' | 'learning' | 'mastered' | 'needs_review'
export type FSRSState  = 0 | 1 | 2 | 3 // New | Learning | Review | Relearning

export interface FlashcardSet {
  id: string
  name: string
  description: string | null
  created_at: string
  user_id: string | null
  is_public: boolean
  tags: string[]
  collection_id: string | null
  icon: string | null
  color: string | null
  position: number | null
}

export interface Collection {
  id: string
  name: string
  description: string | null
  tags: string[]
  user_id: string | null
  created_at: string
  icon: string | null
  color: string | null
  is_public: boolean
}

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface FriendRequest {
  id: string
  from_user_id: string
  to_user_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export interface LeaderboardEntry {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  cards_studied_week: number
  sessions_week: number
  is_me: boolean
  last_set_name: string | null
  last_studied_at: string | null
}

export interface MatchPair {
  left: string
  right: string
}

export interface Flashcard {
  id: string
  set_id: string
  question: string
  type: CardType
  answer: string
  // Multiple choice: the choices. Typed: extra accepted answers.
  options: string[] | null
  // Matching only
  pairs: MatchPair[] | null
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
