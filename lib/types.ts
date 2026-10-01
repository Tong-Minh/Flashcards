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
  // Left out of study until unsuspended / until this time (the next study day). Optional: older
  // desktop libraries don't have them.
  suspended?: boolean
  buried_until?: string | null
}

// One rating (review_logs on the web, reviews/<YYYY-MM>.json on desktop)
export interface ReviewLog {
  id: string
  card_id: string
  // The set the card was in at the time
  set_id: string | null
  rating: 1 | 2 | 3 | 4
  // FSRS state before the review
  state: FSRSState
  // Days since the previous review, and the interval it had scheduled
  elapsed_days: number
  last_scheduled_days: number
  // After the review
  scheduled_days: number
  stability: number
  difficulty: number
  review_ms: number | null
  reviewed_at: string
}

// Study history before the review log existed: one completed session, or one day of rolled-up ones
export interface StudyHistoryEntry {
  set_id: string
  // A session's completion time, or a rolled-up day (YYYY-MM-DD)
  at: string
  cards: number
  correct: number
  seconds: number
}

export interface FlashcardWithProgress extends Flashcard {
  progress: CardProgress | null
}

// One row of the set_study_stats view: a user's totals for a set across recent sessions and
// rolled-up older history
export interface SetStudyStats {
  sessions: number
  cards_studied: number
  correct_count: number
  mastered_count: number
  last_studied_at: string | null
}

export interface StudySession {
  id: string
  set_id: string
  cards_studied: number
  correct_count: number
  mastered_count: number
  completed_at: string
}

// A card's editable content (create/edit forms, imports)
export interface CardDraft {
  type: CardType
  question: string
  answer: string
  options: string[] | null
  pairs: MatchPair[] | null
}
