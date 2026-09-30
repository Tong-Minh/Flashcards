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

export { sortSets } from './store/sort'
