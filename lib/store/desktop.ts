import { inTauri } from '@/lib/platform'
import { memoryFiles, tauriFiles, type Files } from './files'
import { createLocalStore, LIBRARY_VERSION, setPath, type LibraryFile, type SessionRow, type SetFile } from './localStore'
import { asLocal, mediaOf, newerProgress, type ImportResult, type LibraryBundle, type SetBundle } from '@/lib/libraryTransfer'
import type { CardProgress, Flashcard, ReviewLog } from '@/lib/types'
import type { Store } from './types'

// The desktop app's library: a folder the user picks (remembered between launches). Outside the
// Tauri window (`next dev` in a browser) it's a localStorage library, for development.

const ROOT_KEY = 'fc_library_root'
// The folder whose subfolders the app has been granted access to. Versions before 0.1.1 asked for the
// top level only, so their saved folder must be chosen again once.
const ACCESS_KEY = 'fc_library_access'
let current: Store | null = null
let currentFiles: Files | null = null

export function libraryRoot(): string | null {
  if (!inTauri()) return 'Browser storage (development)'
  try {
    const root = localStorage.getItem(ROOT_KEY)
    return root && localStorage.getItem(ACCESS_KEY) === root ? root : null
  } catch {
    return null
  }
}

// A folder remembered without full access (from 0.1.0), which needs choosing again
export function libraryNeedingAccess(): string | null {
  if (!inTauri()) return null
  try { return libraryRoot() ? null : localStorage.getItem(ROOT_KEY) } catch { return null }
}

// Opens the library at `root` (or the remembered one). Returns false if there's none yet.
export function openLibrary(root = libraryRoot()): boolean {
  if (!root) return false
  if (inTauri()) {
    const previous = localStorage.getItem(ROOT_KEY)
    localStorage.setItem(ROOT_KEY, root)
    // Cached sets and cards belong to the old library
    if (previous && previous !== root) clearCaches()
    currentFiles = tauriFiles(root)
  } else {
    currentFiles = memoryFiles()
  }
  const opened = createLocalStore(currentFiles)
  current = opened
  // Clear out images no card uses any more, before anything is being edited
  opened.pruneMedia().catch(() => {})
  return true
}

// Asks for a folder. Picking one also grants the app access to it (kept across launches).
export async function pickLibraryFolder(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  // recursive: access to the folder's subfolders too (sets/<id>/…), not just its top level
  const picked = await open({ directory: true, recursive: true, title: 'Choose a folder for your flashcards' })
  if (typeof picked !== 'string') return null
  localStorage.setItem(ACCESS_KEY, picked)
  return picked
}

function clearCaches() {
  const keep = (k: string) => k === ROOT_KEY || k === ACCESS_KEY || k === 'theme' || k.startsWith('fc_lib/') || k.startsWith('fc_settings_')
  for (const key of Object.keys(localStorage)) if (key.startsWith('fc_') && !keep(key)) localStorage.removeItem(key)
}

// Forwards every call to the open library
export const desktopStore = new Proxy({} as Store, {
  get(_, key: keyof Store) {
    if (key === 'remote') return false
    if (key === 'maxCardsPerSet') return 100_000
    return (...args: unknown[]) => {
      if (!current) throw new Error('No library folder is open')
      return (current[key] as (...a: unknown[]) => unknown)(...args)
    }
  },
})

// ── Library transfer (lib/libraryTransfer.ts) ────────────────────────────────

function openFiles(): Files {
  if (!currentFiles) throw new Error('No library folder is open')
  return currentFiles
}

const parseJson = <T,>(text: string | null | undefined, fallback: T): T => {
  try { return text ? JSON.parse(text) as T : fallback } catch { return fallback }
}

async function readReviews(files: Files): Promise<Map<string, ReviewLog[]>> {
  const months = new Map<string, ReviewLog[]>()
  for (const name of await files.listFiles('reviews')) {
    if (!/^\d{4}-\d{2}\.json$/.test(name)) continue
    months.set(name.slice(0, 7), parseJson<ReviewLog[]>(await files.read(`reviews/${name}`), []))
  }
  return months
}

// The open library as a bundle: everything, or just some sets (with the collections, reviews and
// images they use)
export async function exportBundle(setIds?: string[]): Promise<LibraryBundle> {
  const files = openFiles()
  const library = parseJson<LibraryFile>(await files.read('library.json'), { version: LIBRARY_VERSION, collections: [] })
  const ids = setIds ?? await files.listDirs('sets')
  const sets: SetBundle[] = []
  for (const id of ids) {
    const set = parseJson<SetFile | null>(await files.read(setPath(id, 'set')), null)
    if (!set) continue
    sets.push({
      set: { ...set, id },
      cards: parseJson<Flashcard[]>(await files.read(setPath(id, 'cards')), []),
      progress: parseJson<Record<string, CardProgress>>(await files.read(setPath(id, 'progress')), {}),
      sessions: parseJson<SessionRow[]>(await files.read(setPath(id, 'sessions')), []),
    })
  }
  const cardIds = new Set(sets.flatMap(s => s.cards.map(c => c.id)))
  const reviews = [...(await readReviews(files)).values()].flat().filter(r => !setIds || cardIds.has(r.card_id))
  const collectionIds = new Set(sets.map(s => s.set.collection_id).filter(Boolean))
  const media: Record<string, Uint8Array> = {}
  for (const path of mediaOf(sets.flatMap(s => s.cards))) {
    const bytes = await files.readBytes(path)
    if (bytes) media[path] = bytes
  }
  return {
    library: { ...library, collections: library.collections.filter(c => !setIds || collectionIds.has(c.id)) },
    sets,
    reviews,
    media,
  }
}

// Adds a library zip's contents to the open library without removing or overwriting anything: new
// collections, sets, cards, reviews and images are added, and for progress the newer review wins
export async function importBundle(bundle: LibraryBundle): Promise<ImportResult> {
  const files = openFiles()
  const existing = new Set(await files.listDirs('sets'))
  const result: ImportResult = { added: 0, updated: 0, unchanged: 0, split: 0 }

  const library = parseJson<LibraryFile>(await files.read('library.json'), { version: LIBRARY_VERSION, collections: [] })
  const known = new Set(library.collections.map(c => c.id))
  for (const c of bundle.library.collections) if (!known.has(c.id)) library.collections.push({ ...asLocal(c), is_public: false })
  library.settings ??= bundle.library.settings
  await files.write('library.json', JSON.stringify(library, null, 2))

  for (const s of bundle.sets) {
    const id = s.set.id
    if (!existing.has(id)) {
      await files.write(setPath(id, 'set'), JSON.stringify({ ...asLocal(s.set), is_public: false }, null, 2))
      await files.write(setPath(id, 'cards'), JSON.stringify(s.cards, null, 2))
      await files.write(setPath(id, 'progress'), JSON.stringify(s.progress, null, 2))
      await files.write(setPath(id, 'sessions'), JSON.stringify(s.sessions, null, 2))
      result.added++
      continue
    }
    // Already here: add the cards it doesn't have, and take newer progress
    const cards = parseJson<Flashcard[]>(await files.read(setPath(id, 'cards')), [])
    const progress = parseJson<Record<string, CardProgress>>(await files.read(setPath(id, 'progress')), {})
    const have = new Set(cards.map(c => c.id))
    const newCards = s.cards.filter(c => !have.has(c.id))
    let progressChanged = false
    for (const [key, incoming] of Object.entries(s.progress)) {
      const keep = newerProgress(progress[key], incoming)
      if (keep !== progress[key]) { progress[key] = keep!; progressChanged = true }
    }
    if (newCards.length) await files.write(setPath(id, 'cards'), JSON.stringify([...cards, ...newCards], null, 2))
    if (progressChanged) await files.write(setPath(id, 'progress'), JSON.stringify(progress, null, 2))
    if (newCards.length || progressChanged) result.updated++
    else result.unchanged++
  }

  // Reviews: add the ones this library doesn't have, by month
  const months = await readReviews(files)
  const seen = new Set([...months.values()].flat().map(r => r.id))
  const touched = new Set<string>()
  for (const r of bundle.reviews) {
    if (seen.has(r.id)) continue
    const month = r.reviewed_at.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), r])
    touched.add(month)
  }
  for (const month of touched) {
    const list = months.get(month)!.sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at))
    await files.write(`reviews/${month}.json`, JSON.stringify(list, null, 2))
  }

  for (const [path, bytes] of Object.entries(bundle.media)) {
    if (!(await files.readBytes(path))) await files.writeBytes(path, bytes)
  }

  // Re-read everything
  current = createLocalStore(files)
  return result
}
