// Moving a library between the apps (web ⇄ desktop, Windows ⇄ Mac) as a zip in the desktop app's
// folder layout (lib/store/localStore.ts). Importing never deletes or overwrites anything that's
// there: missing collections, sets, cards, reviews and images are added; for progress, the newer
// review wins; settings are only taken if there are none yet.
import { LIBRARY_VERSION, LOCAL_USER_ID, setPath, type LibraryFile, type SessionRow, type SetFile } from '@/lib/store/localStore'
import type { CardProgress, Flashcard, ReviewLog } from '@/lib/types'

export interface SetBundle {
  set: SetFile
  cards: Flashcard[]
  // By progressKey ("<card id>" or "<card id>:<ord>")
  progress: Record<string, CardProgress>
  sessions: SessionRow[]
}

export interface LibraryBundle {
  library: LibraryFile
  sets: SetBundle[]
  reviews: ReviewLog[]
  // "images/<file>" → bytes
  media: Record<string, Uint8Array>
}

export interface ImportResult {
  added: number       // sets new to this library
  updated: number     // sets already here that gained cards or newer progress
  unchanged: number
  // Web only: sets split in two because they were over the card limit
  split: number
}

const json = (value: unknown) => JSON.stringify(value, null, 2)

function parse<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback
  try { return JSON.parse(text) as T } catch { return fallback }
}

// The progress to keep: whichever was reviewed more recently (a never-reviewed one loses)
export function newerProgress(a: CardProgress | undefined, b: CardProgress | undefined): CardProgress | undefined {
  if (!a) return b
  if (!b) return a
  return (b.last_review ?? '') > (a.last_review ?? '') ? b : a
}

// Image paths a set's cards use
export function mediaOf(cards: Flashcard[]): string[] {
  const used = new Set<string>()
  for (const c of cards) {
    const text = [c.question, c.answer, ...(c.options ?? []), ...(c.pairs ?? []).flatMap(p => [p.left, p.right])].join('\n')
    for (const m of text.matchAll(/(?:images|audio)\/[\w.-]+/g)) used.add(m[0])
  }
  return [...used]
}

export async function zipLibrary(bundle: LibraryBundle): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate')
  const entries: Record<string, Uint8Array> = {}
  entries['library.json'] = strToU8(json(bundle.library))
  for (const s of bundle.sets) {
    entries[setPath(s.set.id, 'set')] = strToU8(json(s.set))
    entries[setPath(s.set.id, 'cards')] = strToU8(json(s.cards))
    entries[setPath(s.set.id, 'progress')] = strToU8(json(s.progress))
    entries[setPath(s.set.id, 'sessions')] = strToU8(json(s.sessions))
  }
  const byMonth = new Map<string, ReviewLog[]>()
  for (const r of bundle.reviews) {
    const month = r.reviewed_at.slice(0, 7)
    byMonth.set(month, [...(byMonth.get(month) ?? []), r])
  }
  for (const [month, list] of byMonth) entries[`reviews/${month}.json`] = strToU8(json(list))
  // Images are already compressed; storing them as-is keeps zipping fast
  for (const [path, bytes] of Object.entries(bundle.media)) entries[path] = bytes
  return zipSync(entries, { level: 6 })
}

export async function readLibraryZip(file: Blob): Promise<LibraryBundle> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const raw = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const text: Record<string, string> = {}
  const media: Record<string, Uint8Array> = {}
  for (const [path, bytes] of Object.entries(raw)) {
    // Zips made by hand may wrap everything in one top-level folder
    const clean = path.replace(/\\/g, '/').replace(/^[^/]+\/(?=(library\.json|sets\/|reviews\/|images\/|audio\/))/, '')
    if (clean.endsWith('.json')) text[clean] = strFromU8(bytes)
    else if (/^(images|audio)\/[\w.-]+$/.test(clean)) media[clean] = bytes
  }
  const setIds = new Set(Object.keys(text).map(p => p.match(/^sets\/([^/]+)\//)?.[1]).filter((id): id is string => !!id))
  if (!text['library.json'] && setIds.size === 0) throw new Error('That zip is not a Flashcards library')

  const library = parse<LibraryFile>(text['library.json'], { version: LIBRARY_VERSION, collections: [] })
  library.collections ??= []
  const sets: SetBundle[] = []
  for (const id of setIds) {
    const set = parse<SetFile | null>(text[setPath(id, 'set')], null)
    if (!set) continue
    sets.push({
      set: { ...set, id },
      cards: parse<Flashcard[]>(text[setPath(id, 'cards')], []).map(c => ({ ...c, set_id: id })),
      progress: parse<Record<string, CardProgress>>(text[setPath(id, 'progress')], {}),
      sessions: parse<SessionRow[]>(text[setPath(id, 'sessions')], []),
    })
  }
  const reviews = Object.entries(text)
    .filter(([p]) => /^reviews\/\d{4}-\d{2}\.json$/.test(p))
    .flatMap(([, t]) => parse<ReviewLog[]>(t, []))
    .map(r => ({ ...r, ord: r.ord ?? 0 }))
  return { library, sets, reviews, media }
}

// Saves or downloads a zip: the desktop app asks where (save dialog); the web downloads it
export async function deliverZip(bytes: Uint8Array, filename: string): Promise<boolean> {
  const { inTauri } = await import('@/lib/platform')
  if (inTauri()) {
    const [{ save }, { writeFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')])
    const path = await save({ title: 'Save library', defaultPath: filename, filters: [{ name: 'Flashcards library', extensions: ['zip'] }] })
    if (!path) return false
    await writeFile(path, bytes)
    return true
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

export const zipName = () => `flashcards-library-${new Date().toISOString().slice(0, 10)}.zip`

// Rows from another app belong to this library's local user
export const asLocal = <T extends { user_id: string | null }>(row: T): T => ({ ...row, user_id: LOCAL_USER_ID })
