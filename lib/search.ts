// Searching sets and collections by text (home and collection pages). "#bio" searches tags only,
// by prefix; anything else matches name, description, or tags.
export interface Searchable { name: string; description: string | null; tags: string[] | null }

export function itemMatcher(search: string): { searching: boolean; tagQuery: string | null; matches: (item: Searchable) => boolean } {
  const raw      = search.trim().toLowerCase()
  const tagQuery = raw.startsWith('#') ? raw.slice(1) : null
  return {
    searching: !!raw && raw !== '#',
    tagQuery,
    matches: item => tagQuery !== null
      ? !!item.tags?.some(t => t.startsWith(tagQuery))
      : !raw || item.name.toLowerCase().includes(raw) || !!item.description?.toLowerCase().includes(raw) || !!item.tags?.some(t => t.includes(raw)),
  }
}
