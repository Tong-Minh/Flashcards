import { sortSets } from './sort'
import type {
  CardProgress, Collection, Flashcard, FlashcardSet, FlashcardWithProgress, SetStudyStats,
} from '@/lib/types'
import type { Files } from './files'
import type { SetWithStats, Store } from './types'

// ── Library folder layout ──────────────────────────────────────────────────────
//   library.json              { version, collections }
//   sets/<id>/set.json        the set (plus stats carried over from the web app, if imported)
//   sets/<id>/cards.json      its cards
//   sets/<id>/progress.json   { [cardId]: FSRS progress }
//   sets/<id>/sessions.json   completed study sessions
// Folders are named by set id, so renaming a set never moves files.

export const LIBRARY_VERSION = 1
export const LOCAL_USER_ID   = 'local'

export interface LibraryFile {
  version: number
  collections: Collection[]
}

export type SetFile = FlashcardSet & {
  // Totals from the web app's history, added to sessions recorded here
  imported_stats?: SetStudyStats | null
}

export interface SessionRow {
  completed_at: string
  cards_studied: number
  correct_count: number
  mastered_count: number
  duration_seconds: number | null
}

interface SetData {
  set: SetFile
  cards: Flashcard[]
  progress: Record<string, CardProgress>
  sessions: SessionRow[]
}

export const setPath = (id: string, file: 'set' | 'cards' | 'progress' | 'sessions') => `sets/${id}/${file}.json`

const json = (value: unknown) => JSON.stringify(value, null, 2)

function parse<T>(text: string | null, fallback: T): T {
  if (!text) return fallback
  try { return JSON.parse(text) as T } catch { return fallback }
}

const uuid = () => crypto.randomUUID()

const IMAGE_TYPES: Record<string, string> = {
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
}

export type LocalStore = Store & { pruneImages(): Promise<number> }

// Card order: manual position first, then creation time
function compareCards(a: Flashcard, b: Flashcard) {
  if (a.position !== b.position) {
    if (a.position === null) return 1
    if (b.position === null) return -1
    return a.position - b.position
  }
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
}

// A Store over a library folder. The whole library is read into memory on first use; each change
// rewrites only the file it touched.
export function createLocalStore(files: Files): LocalStore {
  let library: LibraryFile = { version: LIBRARY_VERSION, collections: [] }
  const sets    = new Map<string, SetData>()
  const cardSet = new Map<string, string>()   // card id → set id
  let loading: Promise<void> | null = null
  // Object URLs of images already read, by path
  const imageUrls = new Map<string, string>()

  function ensure() {
    loading ??= (async () => {
      library = parse(await files.read('library.json'), library)
      library.collections ??= []
      const ids = await files.listDirs('sets')
      await Promise.all(ids.map(async id => {
        const set = parse<SetFile | null>(await files.read(setPath(id, 'set')), null)
        if (!set) return
        const [cards, progress, sessions] = await Promise.all([
          files.read(setPath(id, 'cards')).then(t => parse<Flashcard[]>(t, [])),
          files.read(setPath(id, 'progress')).then(t => parse<Record<string, CardProgress>>(t, {})),
          files.read(setPath(id, 'sessions')).then(t => parse<SessionRow[]>(t, [])),
        ])
        // Hand-edited files may drop fields; fill them in
        set.id = id
        set.tags ??= []
        for (const c of cards) {
          c.set_id = id
          c.id ||= uuid()
          c.options ??= null
          c.pairs ??= null
          c.position ??= null
          c.created_at ||= set.created_at
          cardSet.set(c.id, id)
        }
        sets.set(id, { set, cards, progress, sessions })
      }))
    })()
    return loading
  }

  function data(setId: string): SetData {
    const d = sets.get(setId)
    if (!d) throw new Error(`Set ${setId} not found`)
    return d
  }

  const writeLibrary  = () => files.write('library.json', json(library))
  const writeSet      = (id: string) => files.write(setPath(id, 'set'), json(data(id).set))
  const writeCards    = (id: string) => files.write(setPath(id, 'cards'), json(data(id).cards))
  const writeProgress = (id: string) => files.write(setPath(id, 'progress'), json(data(id).progress))
  const writeSessions = (id: string) => files.write(setPath(id, 'sessions'), json(data(id).sessions))

  function stats(d: SetData): SetStudyStats | null {
    const base = d.set.imported_stats ?? null
    if (!base && d.sessions.length === 0) return null
    const last = d.sessions.reduce<string | null>((m, s) => (!m || s.completed_at > m ? s.completed_at : m), base?.last_studied_at ?? null)
    return {
      sessions:        (base?.sessions ?? 0) + d.sessions.length,
      cards_studied:   (base?.cards_studied ?? 0) + d.sessions.reduce((n, s) => n + s.cards_studied, 0),
      correct_count:   (base?.correct_count ?? 0) + d.sessions.reduce((n, s) => n + s.correct_count, 0),
      mastered_count:  (base?.mastered_count ?? 0) + d.sessions.reduce((n, s) => n + s.mastered_count, 0),
      last_studied_at: last,
    }
  }

  // Groups card ids by the set they're in
  function bySet(cardIds: string[]) {
    const groups = new Map<string, Set<string>>()
    for (const id of cardIds) {
      const setId = cardSet.get(id)
      if (!setId) continue
      if (!groups.has(setId)) groups.set(setId, new Set())
      groups.get(setId)!.add(id)
    }
    return groups
  }

  // After a failed write, memory may be ahead of the disk: forget it all so the next call re-reads the
  // folder, and the app never shows something that isn't saved
  function reset() {
    loading = null
    library = { version: LIBRARY_VERSION, collections: [] }
    sets.clear()
    cardSet.clear()
  }

  const api: LocalStore = {
    remote: false,
    maxCardsPerSet: 100_000,

    async loadLibrary() {
      await ensure()
      const list: SetWithStats[] = sortSets([...sets.values()].map(d => d.set)).map(set => {
        const d = data(set.id)
        const mastered = d.cards.filter(c => d.progress[c.id]?.status === 'mastered').length
        const st = stats(d)
        const { imported_stats: _ignored, ...plain } = d.set
        return {
          ...plain,
          totalCards:    d.cards.length,
          toStudy:       d.cards.length - mastered,
          lastStudied:   st?.last_studied_at ?? null,
          totalSessions: st?.sessions ?? 0,
        }
      })
      return { sets: list, collections: [...library.collections].sort((a, b) => a.name.localeCompare(b.name)) }
    },

    async listCollections() {
      await ensure()
      return [...library.collections].sort((a, b) => a.name.localeCompare(b.name))
    },

    async getSet(id) {
      await ensure()
      const d = sets.get(id)
      if (!d) return null
      const { imported_stats: _ignored, ...plain } = d.set
      return plain
    },

    async createSet(input) {
      await ensure()
      const set: SetFile = { ...input, id: uuid(), created_at: new Date().toISOString(), user_id: LOCAL_USER_ID, position: null }
      sets.set(set.id, { set, cards: [], progress: {}, sessions: [] })
      await Promise.all([writeSet(set.id), writeCards(set.id), writeProgress(set.id), writeSessions(set.id)])
      return set
    },

    async updateSet(id, patch) {
      await ensure()
      Object.assign(data(id).set, patch)
      await writeSet(id)
    },

    async moveSets(ids, collectionId) {
      await ensure()
      for (const id of ids) data(id).set.collection_id = collectionId
      await Promise.all(ids.map(writeSet))
    },

    async setSetsVisibility(ids, isPublic) {
      await ensure()
      for (const id of ids) data(id).set.is_public = isPublic
      await Promise.all(ids.map(writeSet))
    },

    async deleteSets(ids) {
      await ensure()
      for (const id of ids) {
        for (const c of sets.get(id)?.cards ?? []) cardSet.delete(c.id)
        sets.delete(id)
        await files.removeDir(`sets/${id}`)
      }
    },

    async reorderSets(ids) {
      await ensure()
      const changed = ids.filter((id, i) => sets.has(id) && data(id).set.position !== i + 1)
      for (const id of changed) data(id).set.position = ids.indexOf(id) + 1
      await Promise.all(changed.map(writeSet))
    },

    async createCollection(input) {
      await ensure()
      const collection: Collection = {
        id: uuid(), name: input.name, description: input.description ?? null, tags: input.tags ?? [],
        icon: input.icon ?? null, color: input.color ?? null, is_public: false,
        user_id: LOCAL_USER_ID, created_at: new Date().toISOString(),
      }
      library.collections.push(collection)
      await writeLibrary()
      return collection
    },

    async updateCollection(id, patch) {
      await ensure()
      const c = library.collections.find(c => c.id === id)
      if (!c) throw new Error(`Collection ${id} not found`)
      Object.assign(c, patch)
      await writeLibrary()
    },

    async deleteCollection(id) {
      await ensure()
      library.collections = library.collections.filter(c => c.id !== id)
      const inside = [...sets.values()].filter(d => d.set.collection_id === id)
      for (const d of inside) d.set.collection_id = null
      await Promise.all([writeLibrary(), ...inside.map(d => writeSet(d.set.id))])
    },

    async getCards(setId) {
      await ensure()
      const d = sets.get(setId)
      if (!d) return []
      return [...d.cards].sort(compareCards).map<FlashcardWithProgress>(c => ({ ...c, progress: d.progress[c.id] ?? null }))
    },

    async getCard(id) {
      await ensure()
      const setId = cardSet.get(id)
      return (setId && data(setId).cards.find(c => c.id === id)) || null
    },

    async countCards(setId) {
      await ensure()
      return sets.get(setId)?.cards.length ?? 0
    },

    async addCards(setId, drafts) {
      await ensure()
      const d = data(setId)
      // Spaced by a millisecond so bulk imports keep their order
      const start = Date.now()
      drafts.forEach((draft, i) => {
        const card: Flashcard = {
          id: uuid(), set_id: setId, type: draft.type, question: draft.question, answer: draft.answer,
          options: draft.options, pairs: draft.pairs, position: null, created_at: new Date(start + i).toISOString(),
        }
        d.cards.push(card)
        cardSet.set(card.id, setId)
      })
      await writeCards(setId)
    },

    async updateCard(id, draft) {
      await ensure()
      const setId = cardSet.get(id)
      const card = setId && data(setId).cards.find(c => c.id === id)
      if (!setId || !card) throw new Error(`Card ${id} not found`)
      Object.assign(card, draft)
      await writeCards(setId)
    },

    async deleteCards(ids) {
      await ensure()
      for (const [setId, group] of bySet(ids)) {
        const d = data(setId)
        d.cards = d.cards.filter(c => !group.has(c.id))
        for (const id of group) { delete d.progress[id]; cardSet.delete(id) }
        await Promise.all([writeCards(setId), writeProgress(setId)])
      }
    },

    async clearCards(setId) {
      await ensure()
      const d = data(setId)
      for (const c of d.cards) cardSet.delete(c.id)
      d.cards = []
      d.progress = {}
      await Promise.all([writeCards(setId), writeProgress(setId)])
    },

    async moveCards(ids, destSetId) {
      await ensure()
      const dest = data(destSetId)
      for (const [setId, group] of bySet(ids)) {
        if (setId === destSetId) continue
        const src = data(setId)
        for (const card of src.cards.filter(c => group.has(c.id))) {
          dest.cards.push({ ...card, set_id: destSetId, position: null })
          if (src.progress[card.id]) dest.progress[card.id] = src.progress[card.id]
          delete src.progress[card.id]
          cardSet.set(card.id, destSetId)
        }
        src.cards = src.cards.filter(c => !group.has(c.id))
        await Promise.all([writeCards(setId), writeProgress(setId)])
      }
      await Promise.all([writeCards(destSetId), writeProgress(destSetId)])
    },

    async reorderCards(changes) {
      await ensure()
      const touched = new Set<string>()
      for (const { id, position } of changes) {
        const setId = cardSet.get(id)
        const card = setId && data(setId).cards.find(c => c.id === id)
        if (!setId || !card) continue
        card.position = position
        touched.add(setId)
      }
      await Promise.all([...touched].map(writeCards))
    },

    async saveProgress(cardId, fields) {
      await ensure()
      const setId = cardSet.get(cardId)
      if (!setId) throw new Error(`Card ${cardId} not found`)
      const d = data(setId)
      d.progress[cardId] = { id: d.progress[cardId]?.id ?? uuid(), card_id: cardId, ...fields }
      await writeProgress(setId)
    },

    async resetProgress(cardIds) {
      await ensure()
      for (const [setId, group] of bySet(cardIds)) {
        const d = data(setId)
        for (const id of group) delete d.progress[id]
        await writeProgress(setId)
      }
    },

    async recordSession(setId, s) {
      await ensure()
      data(setId).sessions.push({ completed_at: new Date().toISOString(), ...s })
      await writeSessions(setId)
    },

    async getSetStats(setId) {
      await ensure()
      const d = sets.get(setId)
      return d ? stats(d) : null
    },

    // Named by a hash of the bytes, so the same image is stored once however many cards use it
    async saveImage(bytes, ext) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
      const hash = [...digest.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('')
      const path = `images/${hash}.${ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'}`
      if (!(await files.readBytes(path))) await files.writeBytes(path, bytes)
      return path
    },

    async imageUrl(path) {
      if (!/^images\/[\w.-]+$/.test(path)) return null
      const cached = imageUrls.get(path)
      if (cached) return cached
      const bytes = await files.readBytes(path)
      if (!bytes) return null
      const ext = path.split('.').pop()!.toLowerCase()
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: IMAGE_TYPES[ext] ?? 'application/octet-stream' }))
      imageUrls.set(path, url)
      return url
    },

    // Deletes images no card refers to any more. Run when the library opens, before anything can be
    // mid-edit (a card being written may use an image it hasn't saved yet).
    async pruneImages() {
      await ensure()
      const used = new Set<string>()
      for (const d of sets.values()) {
        for (const c of d.cards) {
          const text = [c.question, c.answer, ...(c.options ?? []), ...(c.pairs ?? []).flatMap(p => [p.left, p.right])].join('\n')
          for (const m of text.matchAll(/images\/[\w.-]+/g)) used.add(m[0])
        }
      }
      let removed = 0
      for (const name of await files.listFiles('images')) {
        if (name.endsWith('.tmp') || !used.has(`images/${name}`)) { await files.remove(`images/${name}`); removed++ }
      }
      return removed
    },
  }

  // Reads never leave memory ahead of the disk, so only writes need the reset below
  const READS = new Set<string>(['imageUrl', 'pruneImages'])
  for (const key of Object.keys(api) as (keyof LocalStore)[]) {
    const fn = api[key]
    if (typeof fn !== 'function' || READS.has(key)) continue
    ;(api as unknown as Record<string, unknown>)[key] = async (...args: unknown[]) => {
      try {
        return await (fn as (...a: unknown[]) => Promise<unknown>).apply(api, args)
      } catch (err) {
        reset()
        throw err
      }
    }
  }
  return api
}
