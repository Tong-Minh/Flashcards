import { inTauri } from '@/lib/platform'
import { memoryFiles, tauriFiles, type Files } from './files'
import { createLocalStore, LIBRARY_VERSION, LOCAL_USER_ID, type LibraryFile } from './localStore'
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
  opened.pruneImages().catch(() => {})
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

// Adds a library exported from the web app (paths → file text, in the folder layout) to the open
// library. Sets already in it (same id) are skipped, so importing twice doesn't duplicate anything.
export async function importLibraryFiles(entries: Record<string, string>): Promise<{ added: number; skipped: number }> {
  const files = currentFiles
  if (!files) throw new Error('No library folder is open')
  const existing = new Set(await files.listDirs('sets'))

  const parse = <T,>(text: string | null | undefined, fallback: T): T => {
    try { return text ? JSON.parse(text) as T : fallback } catch { return fallback }
  }
  const library  = parse<LibraryFile>(await files.read('library.json'), { version: LIBRARY_VERSION, collections: [] })
  const incoming = parse<LibraryFile>(entries['library.json'], { version: LIBRARY_VERSION, collections: [] })
  const known = new Set(library.collections.map(c => c.id))
  for (const c of incoming.collections ?? []) if (!known.has(c.id)) library.collections.push({ ...c, user_id: LOCAL_USER_ID })
  await files.write('library.json', JSON.stringify(library, null, 2))

  const setIds = new Set(Object.keys(entries).map(p => p.match(/^sets\/([^/]+)\//)?.[1]).filter((id): id is string => !!id))
  let added = 0, skipped = 0
  for (const id of setIds) {
    if (existing.has(id)) { skipped++; continue }
    for (const [path, text] of Object.entries(entries)) if (path.startsWith(`sets/${id}/`)) await files.write(path, text)
    added++
  }
  // Re-read everything
  current = createLocalStore(files)
  return { added, skipped }
}
