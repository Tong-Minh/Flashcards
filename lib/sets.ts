import { supabase } from './supabase/client'
import { fetchAllRows } from './fetchAll'
import { cacheSets, cacheCollections } from './storage'
import type { Collection, FlashcardSet } from './types'

export interface SetWithStats extends FlashcardSet {
  totalCards: number
  toStudy: number
  lastStudied: string | null
  totalSessions: number
}

// Loads the user's sets (with card/progress/session stats) and collections, and refreshes the cache.
export async function loadSetsAndCollections(userId: string): Promise<{
  sets: SetWithStats[]
  collections: Collection[]
}> {
  const [setsRes, collectionsRes] = await Promise.all([
    supabase.from('sets').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
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

  const [counts, sessions] = await Promise.all([
    Promise.all(setIds.map(countFor)),
    setIds.length === 0 ? [] : fetchAllRows<{ set_id: string; completed_at: string }>(() =>
      supabase.from('study_sessions').select('set_id, completed_at').in('set_id', setIds)
        .order('completed_at', { ascending: false }).order('id')),
  ])

  const lastStudiedBySet: Record<string, string>  = {}
  const sessionCountBySet: Record<string, number> = {}
  for (const s of sessions) {
    if (!lastStudiedBySet[s.set_id]) lastStudiedBySet[s.set_id] = s.completed_at
    sessionCountBySet[s.set_id] = (sessionCountBySet[s.set_id] ?? 0) + 1
  }

  const statsMap: Record<string, { total: number; mastered: number }> = Object.fromEntries(counts)

  const sets = rawSets.map(s => ({
    ...s,
    tags:          s.tags ?? [],
    totalCards:    statsMap[s.id]?.total ?? 0,
    toStudy:       (statsMap[s.id]?.total ?? 0) - (statsMap[s.id]?.mastered ?? 0),
    lastStudied:   lastStudiedBySet[s.id]  ?? null,
    totalSessions: sessionCountBySet[s.id] ?? 0,
  }))

  cacheSets(sets)
  cacheCollections(collections)
  return { sets, collections }
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, 30)
}
