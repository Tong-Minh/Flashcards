import { supabase } from '@/lib/supabase/client'
import { fetchAllRows, MAX_CARDS_PER_SET } from '@/lib/fetchAll'
import type { Collection, Flashcard, FlashcardSet, FlashcardWithProgress, SetStudyStats } from '@/lib/types'
import { PartialInsertError, type SetWithStats, type Store } from './types'

// Id lists go in the query string, so bulk edits are chunked to stay well under URL length limits
async function eachChunk(ids: string[], fn: (chunk: string[]) => PromiseLike<{ error: unknown }>) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await fn(ids.slice(i, i + 200))
    if (error) throw error
  }
}

async function check<T extends { error: unknown }>(query: PromiseLike<T>): Promise<T> {
  const res = await query
  if (res.error) throw res.error
  return res
}

// Inserts are chunked to keep request bodies reasonable for large imports
const INSERT_CHUNK = 500

export const supabaseStore: Store = {
  remote: true,
  maxCardsPerSet: MAX_CARDS_PER_SET,

  async loadLibrary(userId) {
    const [setsRes, collectionsRes] = await Promise.all([
      // Manual order first; sets never reordered (position null) are newest-first on top
      supabase.from('sets').select('*').eq('user_id', userId)
        .order('position', { ascending: true, nullsFirst: true }).order('created_at', { ascending: false }),
      supabase.from('collections').select('*').eq('user_id', userId).order('name', { ascending: true }),
    ])
    const rawSets = (setsRes.data ?? []) as FlashcardSet[]
    const collections = (collectionsRes.data ?? []) as Collection[]
    const setIds = rawSets.map(s => s.id)

    // Exact counts per set are computed server-side, so they aren't affected by the API row cap.
    const countFor = async (setId: string) => {
      const [total, mastered] = await Promise.all([
        supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('set_id', setId),
        supabase.from('card_progress').select('id, flashcards!inner(set_id)', { count: 'exact', head: true })
          .eq('status', 'mastered').eq('flashcards.set_id', setId),
      ])
      if (total.error) throw total.error
      if (mastered.error) throw mastered.error
      return [setId, { total: total.count ?? 0, mastered: mastered.count ?? 0 }] as const
    }

    // One row per set from the set_study_stats view, which also counts rolled-up older sessions
    const [counts, studyStats] = await Promise.all([
      Promise.all(setIds.map(countFor)),
      setIds.length === 0 ? [] : fetchAllRows<{ set_id: string; sessions: number; last_studied_at: string | null }>(() =>
        supabase.from('set_study_stats').select('set_id, sessions, last_studied_at').eq('user_id', userId).in('set_id', setIds)
          .order('set_id')),
    ])

    const lastStudiedBySet: Record<string, string>  = {}
    const sessionCountBySet: Record<string, number> = {}
    for (const s of studyStats) {
      if (s.last_studied_at) lastStudiedBySet[s.set_id] = s.last_studied_at
      sessionCountBySet[s.set_id] = s.sessions
    }

    const statsMap: Record<string, { total: number; mastered: number }> = Object.fromEntries(counts)

    const sets: SetWithStats[] = rawSets.map(s => ({
      ...s,
      tags:          s.tags ?? [],
      totalCards:    statsMap[s.id]?.total ?? 0,
      toStudy:       (statsMap[s.id]?.total ?? 0) - (statsMap[s.id]?.mastered ?? 0),
      lastStudied:   lastStudiedBySet[s.id]  ?? null,
      totalSessions: sessionCountBySet[s.id] ?? 0,
    }))
    return { sets, collections }
  },

  async listCollections(userId) {
    // Own collections only: RLS also returns other people's shared ones
    const { data } = await check(supabase.from('collections').select('*').eq('user_id', userId).order('name'))
    return (data ?? []) as Collection[]
  },

  async getSet(id) {
    const { data } = await supabase.from('sets').select('*').eq('id', id).maybeSingle()
    return (data as FlashcardSet | null) ?? null
  },

  async createSet(input) {
    const { data } = await check(supabase.from('sets').insert(input).select().single())
    return data as FlashcardSet
  },

  async updateSet(id, patch) {
    await check(supabase.from('sets').update(patch).eq('id', id))
  },

  moveSets(ids, collectionId) {
    return eachChunk(ids, chunk => supabase.from('sets').update({ collection_id: collectionId }).in('id', chunk))
  },

  setSetsVisibility(ids, isPublic) {
    return eachChunk(ids, chunk => supabase.from('sets').update({ is_public: isPublic }).in('id', chunk))
  },

  // Cards, progress, and sessions cascade-delete with their set
  deleteSets(ids) {
    return eachChunk(ids, chunk => supabase.from('sets').delete().in('id', chunk))
  },

  async reorderSets(ids) {
    await check(supabase.rpc('reorder_sets', { set_ids: ids }))
  },

  async createCollection(input) {
    const { data } = await check(supabase.from('collections').insert(input).select().single())
    return data as Collection
  },

  async updateCollection(id, patch) {
    await check(supabase.from('collections').update(patch).eq('id', id))
  },

  // sets.collection_id is `on delete set null`
  async deleteCollection(id) {
    await check(supabase.from('collections').delete().eq('id', id))
  },

  async getCards(setId) {
    const rows = await fetchAllRows<FlashcardWithProgress>(() => supabase
      .from('flashcards')
      .select('*, progress:card_progress(*)')
      .eq('set_id', setId)
      .order('position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }), MAX_CARDS_PER_SET)
    // The embedded relation comes back as an array
    return rows.map(c => ({ ...c, progress: Array.isArray(c.progress) ? (c.progress[0] ?? null) : c.progress }))
  },

  async getCard(id) {
    const { data } = await supabase.from('flashcards').select('*').eq('id', id).maybeSingle()
    return (data as Flashcard | null) ?? null
  },

  async countCards(setId) {
    const { count } = await check(supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('set_id', setId))
    return count ?? 0
  },

  async addCards(setId, cards) {
    const rows = cards.map(c => ({ set_id: setId, question: c.question, answer: c.answer, options: c.options, pairs: c.pairs, type: c.type }))
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error } = await supabase.from('flashcards').insert(rows.slice(i, i + INSERT_CHUNK))
      if (error) throw i === 0 ? error : new PartialInsertError(i)
    }
  },

  async updateCard(id, draft) {
    await check(supabase.from('flashcards').update(draft).eq('id', id))
  },

  // card_progress rows cascade-delete with their cards
  deleteCards(ids) {
    return eachChunk(ids, chunk => supabase.from('flashcards').delete().in('id', chunk))
  },

  async clearCards(setId) {
    await check(supabase.from('flashcards').delete().eq('set_id', setId))
  },

  moveCards(ids, destSetId) {
    return eachChunk(ids, chunk => supabase.from('flashcards').update({ set_id: destSetId, position: null }).in('id', chunk))
  },

  async reorderCards(changes) {
    await check(supabase.rpc('reorder_cards', {
      card_ids:  changes.map(c => c.id),
      positions: changes.map(c => c.position),
    }))
  },

  async saveProgress(cardId, p) {
    await check(supabase.from('card_progress').upsert({
      card_id:        cardId,
      correct_count:  p.correct_count,
      status:         p.status,
      last_reviewed:  p.last_reviewed,
      due:            p.due,
      stability:      p.stability,
      difficulty:     p.difficulty,
      elapsed_days:   p.elapsed_days,
      scheduled_days: p.scheduled_days,
      reps:           p.reps,
      lapses:         p.lapses,
      learning_steps: p.learning_steps,
      fsrs_state:     p.fsrs_state,
      last_review:    p.last_review,
    }, { onConflict: 'user_id,card_id' }))
  },

  resetProgress(cardIds) {
    return eachChunk(cardIds, chunk => supabase.from('card_progress').delete().in('card_id', chunk))
  },

  async recordSession(setId, s) {
    await check(supabase.from('study_sessions').insert({ set_id: setId, ...s }))
  },

  // Totals come from the set_study_stats view, which includes rolled-up older sessions
  async getSetStats(setId) {
    const { data } = await supabase.from('set_study_stats')
      .select('sessions, cards_studied, correct_count, mastered_count, last_studied_at').eq('set_id', setId).maybeSingle()
    return (data as SetStudyStats | null) ?? null
  },
}
