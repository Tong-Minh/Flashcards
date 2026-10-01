import type {
  CardDraft, CardProgress, Collection, Flashcard, FlashcardSet, FlashcardWithProgress, ReviewLog, SetStudyStats,
  StudyHistoryEntry, StudySettings,
} from '@/lib/types'

// A set with the stats shown on the home screen
export interface SetWithStats extends FlashcardSet {
  totalCards: number
  toStudy: number
  lastStudied: string | null
  totalSessions: number
}

export type SetInput = Pick<FlashcardSet, 'name' | 'description' | 'is_public' | 'tags' | 'collection_id' | 'icon' | 'color'>
export type SetPatch = Partial<SetInput> & Pick<FlashcardSet, 'desired_retention'>
export type CollectionInput = Pick<Collection, 'name'> & Partial<Pick<Collection, 'description' | 'tags' | 'icon' | 'color'>>
export type CollectionPatch = Partial<Pick<Collection, 'name' | 'description' | 'tags' | 'icon' | 'color' | 'is_public'>>
// FSRS fields saved after a review (the row's id and card are implied)
export type ProgressFields = Omit<CardProgress, 'id' | 'card_id' | 'ord'>
export interface SessionInput {
  cards_studied: number
  correct_count: number
  mastered_count: number
  duration_seconds: number | null
}

// Thrown by addCards when some cards were saved before a failure
export class PartialInsertError extends Error {
  constructor(public added: number) { super(`Only ${added} cards were added`) }
}

// Everything the app reads and writes about the user's own sets. The web app uses Supabase
// (supabaseStore); the desktop app uses files in a library folder (fileStore). Social features
// (friends, discover, sharing, forking) are web-only and call Supabase directly.
export interface Store {
  // Pages check navigator.onLine and queue offline progress only when the store is remote
  remote: boolean
  maxCardsPerSet: number

  // `userId` scopes queries on the web (RLS also returns other people's public items)
  loadLibrary(userId: string): Promise<{ sets: SetWithStats[]; collections: Collection[] }>
  listCollections(userId: string): Promise<Collection[]>

  getSet(id: string): Promise<FlashcardSet | null>
  createSet(input: SetInput): Promise<FlashcardSet>
  updateSet(id: string, patch: SetPatch): Promise<void>
  moveSets(ids: string[], collectionId: string | null): Promise<void>
  setSetsVisibility(ids: string[], isPublic: boolean): Promise<void>
  // Cards, progress and sessions go with them
  deleteSets(ids: string[]): Promise<void>
  // Manual order: position = index + 1
  reorderSets(ids: string[]): Promise<void>

  createCollection(input: CollectionInput): Promise<Collection>
  updateCollection(id: string, patch: CollectionPatch): Promise<void>
  // Its sets are kept, with no collection
  deleteCollection(id: string): Promise<void>

  // In card order (position, then created_at), each with the user's progress
  getCards(setId: string): Promise<FlashcardWithProgress[]>
  getCard(id: string): Promise<Flashcard | null>
  countCards(setId: string): Promise<number>
  addCards(setId: string, cards: CardDraft[]): Promise<void>
  updateCard(id: string, draft: CardDraft): Promise<void>
  deleteCards(ids: string[]): Promise<void>
  clearCards(setId: string): Promise<void>
  // To the end of the other set, keeping progress
  moveCards(ids: string[], destSetId: string): Promise<void>
  reorderCards(changes: { id: string; position: number }[]): Promise<void>

  // `ord` is the direction (1 = a reversed card's back to front); progress is kept per direction
  saveProgress(cardId: string, progress: ProgressFields, ord?: number): Promise<void>
  // Back to New: every direction, or just `ord`. Also how an undone first review is removed.
  resetProgress(cardIds: string[], ord?: number): Promise<void>
  // Directions with no progress yet get a New row carrying the flag
  setSuspended(items: { cardId: string; ord: number }[], suspended: boolean): Promise<void>
  recordSession(setId: string, session: SessionInput): Promise<void>
  getSetStats(setId: string): Promise<SetStudyStats | null>

  // The review log. Reviews of cards that have since moved count for their current set.
  logReview(review: ReviewLog): Promise<void>
  deleteReview(id: string): Promise<void>
  // All the user's reviews, or those of cards now in `setIds`, oldest first
  getReviews(setIds?: string[]): Promise<ReviewLog[]>
  // Session totals (and rolled-up days), for history before the review log
  getStudyHistory(setIds?: string[]): Promise<StudyHistoryEntry[]>

  // Study settings (target retention, new-day hour, FSRS parameters); null if never saved
  getSettings(): Promise<Partial<StudySettings> | null>
  saveSettings(settings: StudySettings): Promise<void>

  // Card images (desktop app only). saveImage stores the bytes and returns the path cards use
  // ("images/<hash>.<ext>"); imageUrl gives a URL to display one, or null if it's missing.
  saveImage(bytes: Uint8Array, ext: string): Promise<string>
  imageUrl(path: string): Promise<string | null>
}
