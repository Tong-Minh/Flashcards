import { supabaseStore } from '@/lib/store/supabaseStore'
import { LIBRARY_VERSION, LOCAL_USER_ID, setPath, type LibraryFile, type SetFile } from '@/lib/store/localStore'
import type { CardProgress, Flashcard } from '@/lib/types'
import { progressKey } from '@/lib/srs'

const json = (value: unknown) => JSON.stringify(value, null, 2)

// Web app: the user's whole library as a zip in the desktop app's folder layout (see localStore.ts),
// with study progress and history totals, ready for the desktop app's "Import library".
export async function downloadLibraryZip(userId: string, onProgress?: (done: number, total: number) => void) {
  const { zipSync, strToU8 } = await import('fflate')
  const { sets, collections } = await supabaseStore.loadLibrary(userId)
  const entries: Record<string, Uint8Array> = {}
  const add = (path: string, value: unknown) => { entries[path] = strToU8(json(value)) }

  const library: LibraryFile = {
    version: LIBRARY_VERSION,
    collections: collections.map(c => ({ ...c, user_id: LOCAL_USER_ID, is_public: false })),
  }
  add('library.json', library)

  let done = 0
  for (const s of sets) {
    const [cards, stats] = await Promise.all([supabaseStore.getCards(s.id), supabaseStore.getSetStats(s.id)])
    const { totalCards: _t, toStudy: _s, lastStudied: _l, totalSessions: _n, ...plain } = s
    const set: SetFile = { ...plain, user_id: LOCAL_USER_ID, imported_stats: stats }
    const progress: Record<string, CardProgress> = {}
    const bare: Flashcard[] = cards.map(({ progress: p, extraProgress, ...card }) => {
      if (p) progress[card.id] = p
      for (const [ord, extra] of Object.entries(extraProgress ?? {})) progress[progressKey(card.id, Number(ord))] = extra
      return card
    })
    add(setPath(s.id, 'set'), set)
    add(setPath(s.id, 'cards'), bare)
    add(setPath(s.id, 'progress'), progress)
    add(setPath(s.id, 'sessions'), [])
    onProgress?.(++done, sets.length)
  }

  const blob = new Blob([zipSync(entries)], { type: 'application/zip' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `flashcards-library-${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Desktop app: a zip from downloadLibraryZip, as path → text
export async function readLibraryZip(file: File): Promise<Record<string, string>> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const raw = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const out: Record<string, string> = {}
  for (const [path, bytes] of Object.entries(raw)) {
    // Zips made by hand may wrap everything in one top-level folder
    const clean = path.replace(/\\/g, '/').replace(/^[^/]+\/(?=(library\.json|sets\/))/, '')
    if (clean.endsWith('.json')) out[clean] = strFromU8(bytes)
  }
  if (!out['library.json'] && !Object.keys(out).some(p => p.startsWith('sets/'))) {
    throw new Error('That zip is not a Flashcards library')
  }
  return out
}
