// Home-screen order: manual position, unpositioned (new) sets first, then newest first. Matches the
// Supabase query order in supabaseStore.loadLibrary.
export function sortSets<T extends { position: number | null; created_at: string }>(sets: T[]): T[] {
  return [...sets].sort((a, b) =>
    a.position === b.position ? b.created_at.localeCompare(a.created_at)
    : a.position === null ? -1
    : b.position === null ? 1
    : a.position - b.position)
}
