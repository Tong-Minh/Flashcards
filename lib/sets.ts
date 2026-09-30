import { store, type SetWithStats } from './store'
import { cacheSets, cacheCollections } from './storage'
import type { Collection } from './types'

export type { SetWithStats } from './store'

// Loads the user's sets (with card/progress/session stats) and collections, and refreshes the cache.
export async function loadSetsAndCollections(userId: string): Promise<{
  sets: SetWithStats[]
  collections: Collection[]
}> {
  const { sets, collections } = await store.loadLibrary(userId)
  cacheSets(sets)
  cacheCollections(collections)
  return { sets, collections }
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, 30)
}

// ── Bulk edits ────────────────────────────────────────────────────────────────

export const moveSets         = (ids: string[], collectionId: string | null) => store.moveSets(ids, collectionId)
export const setSetsVisibility = (ids: string[], isPublic: boolean) => store.setSetsVisibility(ids, isPublic)
// Cards, progress, and sessions go with their set
export const deleteSets       = (ids: string[]) => store.deleteSets(ids)
// Saves the given order (position = index + 1) for the caller's sets
export const reorderSets      = (ids: string[]) => store.reorderSets(ids)

// Same order as loadLibrary: manual position, unpositioned (new) sets first, then newest first
export function sortSets<T extends { position: number | null; created_at: string }>(sets: T[]): T[] {
  return [...sets].sort((a, b) =>
    a.position === b.position ? b.created_at.localeCompare(a.created_at)
    : a.position === null ? -1
    : b.position === null ? 1
    : a.position - b.position)
}
