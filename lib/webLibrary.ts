// The web app's side of library transfer (lib/libraryTransfer.ts): building a zip's contents from
// Supabase, and adding a zip's contents to it. Images and audio stay behind (the web app has no
// media storage); their lines remain in the cards and show a placeholder.
import { supabase } from '@/lib/supabase/client'
import { fetchAllRows, MAX_CARDS_PER_SET } from '@/lib/fetchAll'
import { supabaseStore } from '@/lib/store/supabaseStore'
import { LIBRARY_VERSION, LOCAL_USER_ID, type SessionRow, type SetFile } from '@/lib/store/localStore'
import { progressKey } from '@/lib/srs'
import { newerProgress, type ImportResult, type LibraryBundle, type SetBundle } from '@/lib/libraryTransfer'
import type { CardProgress, Flashcard, ReviewLog } from '@/lib/types'

const CHUNK = 200

async function inChunks<T>(items: T[], fn: (chunk: T[]) => PromiseLike<{ error: unknown }>) {
  for (let i = 0; i < items.length; i += CHUNK) {
    const { error } = await fn(items.slice(i, i + CHUNK))
    if (error) throw error
  }
}

export async function exportWebBundle(userId: string, setIds?: string[], onProgress?: (done: number, total: number) => void): Promise<LibraryBundle> {
  const { sets, collections } = await supabaseStore.loadLibrary(userId)
  const chosen = setIds ? sets.filter(s => setIds.includes(s.id)) : sets
  const bundles: SetBundle[] = []
  let done = 0
  for (const s of chosen) {
    const [cards, history] = await Promise.all([supabaseStore.getCards(s.id), supabaseStore.getStudyHistory([s.id])])
    const { totalCards: _t, toStudy: _s, lastStudied: _l, totalSessions: _n, ...plain } = s
    const progress: Record<string, CardProgress> = {}
    const bare: Flashcard[] = cards.map(({ progress: p, extraProgress, ...card }) => {
      if (p) progress[card.id] = p
      for (const [ord, extra] of Object.entries(extraProgress ?? {})) progress[progressKey(card.id, Number(ord))] = extra
      return card
    })
    // Sessions (and rolled-up days) travel as sessions, so the calendar keeps its history
    const sessions: SessionRow[] = history.map(h => ({
      completed_at: /^\d{4}-\d{2}-\d{2}$/.test(h.at) ? `${h.at}T12:00:00.000Z` : h.at,
      cards_studied: h.cards, correct_count: h.correct, mastered_count: 0, duration_seconds: h.seconds,
    }))
    const set: SetFile = { ...plain, user_id: LOCAL_USER_ID, is_public: false }
    bundles.push({ set, cards: bare, progress, sessions })
    onProgress?.(++done, chosen.length)
  }
  const used = new Set(chosen.map(s => s.collection_id))
  const [reviews, settings] = await Promise.all([
    supabaseStore.getReviews(chosen.map(s => s.id)),
    supabaseStore.getSettings().catch(() => null),
  ])
  return {
    library: {
      version: LIBRARY_VERSION,
      collections: collections.filter(c => !setIds || used.has(c.id)).map(c => ({ ...c, user_id: LOCAL_USER_ID, is_public: false })),
      ...(settings && { settings: settings as LibraryBundle['library']['settings'] }),
    },
    sets: bundles,
    reviews,
    media: {},
  }
}

const progressRow = (cardId: string, ord: number, p: CardProgress) => ({
  card_id: cardId, ord,
  correct_count: p.correct_count, status: p.status, last_reviewed: p.last_reviewed, due: p.due,
  stability: p.stability, difficulty: p.difficulty, elapsed_days: p.elapsed_days, scheduled_days: p.scheduled_days,
  reps: p.reps, lapses: p.lapses, learning_steps: p.learning_steps, fsrs_state: p.fsrs_state, last_review: p.last_review,
  suspended: p.suspended ?? false, buried_until: p.buried_until ?? null,
})

const cardRow = (c: Flashcard, setId: string) => ({
  id: c.id, set_id: setId, question: c.question, answer: c.answer, type: c.type, options: c.options, pairs: c.pairs,
  position: c.position, created_at: c.created_at, reverse: c.reverse ?? false, occlusion: c.occlusion ?? null,
})

// Adds a library zip's contents to the user's web library. Nothing there is removed or overwritten;
// a set too big for the web app is split into parts.
export async function importWebBundle(bundle: LibraryBundle, userId: string, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, unchanged: 0, split: 0 }
  const { sets: mySets, collections: myCollections } = await supabaseStore.loadLibrary(userId)
  const setCount = new Map(mySets.map(s => [s.id, s.totalCards]))

  // Collections
  const haveCollection = new Set(myCollections.map(c => c.id))
  const newCollections = bundle.library.collections.filter(c => !haveCollection.has(c.id))
  if (newCollections.length) {
    const { error } = await supabase.from('collections').insert(newCollections.map(c => ({
      id: c.id, name: c.name, description: c.description, tags: c.tags ?? [], icon: c.icon, color: c.color, is_public: false, created_at: c.created_at,
    })))
    if (error) throw error
    for (const c of newCollections) haveCollection.add(c.id)
  }

  // Every card id the user already has in these sets, so only missing ones are added
  const bundleSetIds = bundle.sets.map(s => s.set.id).filter(id => setCount.has(id))
  const haveCards = new Set<string>()
  for (let i = 0; i < bundleSetIds.length; i += 50) {
    const rows = await fetchAllRows<{ id: string }>(() => supabase.from('flashcards').select('id').in('set_id', bundleSetIds.slice(i, i + 50)).order('id'))
    for (const r of rows) haveCards.add(r.id)
  }

  const importedCards = new Set<string>()
  let done = 0
  for (const s of bundle.sets) {
    const isNew = !setCount.has(s.set.id)
    const missing = s.cards.filter(c => !haveCards.has(c.id))
    if (isNew) {
      const { error } = await supabase.from('sets').insert({
        id: s.set.id, name: s.set.name, description: s.set.description, is_public: false, tags: s.set.tags ?? [],
        collection_id: s.set.collection_id && haveCollection.has(s.set.collection_id) ? s.set.collection_id : null,
        icon: s.set.icon, color: s.set.color, position: s.set.position, desired_retention: s.set.desired_retention ?? null,
        created_at: s.set.created_at,
      })
      if (error) throw error
      setCount.set(s.set.id, 0)
    }

    // Fill the set up to the card limit, then continue in new parts
    const room = Math.max(0, MAX_CARDS_PER_SET - (setCount.get(s.set.id) ?? 0))
    const placements: { setId: string; cards: Flashcard[] }[] = [{ setId: s.set.id, cards: missing.slice(0, room) }]
    for (let i = room, part = 2; i < missing.length; i += MAX_CARDS_PER_SET, part++) {
      const { data, error } = await supabase.from('sets').insert({
        name: `${s.set.name} (part ${part})`, description: s.set.description, is_public: false, tags: s.set.tags ?? [],
        collection_id: s.set.collection_id && haveCollection.has(s.set.collection_id) ? s.set.collection_id : null,
        icon: s.set.icon, color: s.set.color, desired_retention: s.set.desired_retention ?? null,
      }).select('id').single()
      if (error) throw error
      placements.push({ setId: data.id as string, cards: missing.slice(i, i + MAX_CARDS_PER_SET) })
      if (part === 2) result.split++
    }
    for (const { setId, cards } of placements) {
      await inChunks(cards, chunk => supabase.from('flashcards').insert(chunk.map(c => cardRow(c, setId))))
      for (const c of cards) importedCards.add(c.id)
    }

    if (isNew && s.sessions.length) {
      await inChunks(s.sessions, chunk => supabase.from('study_sessions').insert(chunk.map(x => ({
        set_id: s.set.id, cards_studied: x.cards_studied, correct_count: x.correct_count,
        mastered_count: x.mastered_count, duration_seconds: x.duration_seconds, completed_at: x.completed_at,
      }))))
    }

    // Progress: keep whichever was reviewed more recently
    const keys = Object.keys(s.progress)
    const cardIds = [...new Set(keys.map(k => k.split(':')[0]))].filter(id => haveCards.has(id) || importedCards.has(id))
    const current = new Map<string, CardProgress>()
    for (let i = 0; i < cardIds.length; i += CHUNK) {
      const { data, error } = await supabase.from('card_progress').select('*').in('card_id', cardIds.slice(i, i + CHUNK))
      if (error) throw error
      for (const p of (data ?? []) as CardProgress[]) current.set(progressKey(p.card_id, p.ord ?? 0), p)
    }
    const rows = keys.flatMap(key => {
      const [cardId, ordText] = key.split(':')
      if (!cardIds.includes(cardId)) return []
      const incoming = s.progress[key]
      const keep = newerProgress(current.get(key), incoming)
      return keep === incoming && keep !== current.get(key) ? [progressRow(cardId, Number(ordText ?? 0), incoming)] : []
    })
    await inChunks(rows, chunk => supabase.from('card_progress').upsert(chunk, { onConflict: 'user_id,card_id,ord' }))

    if (isNew) result.added++
    else if (missing.length || rows.length) result.updated++
    else result.unchanged++
    onProgress?.(++done, bundle.sets.length)
  }

  // Reviews of cards the user now has, skipping ones already logged
  const allowed = new Set([...haveCards, ...importedCards])
  const reviews = bundle.reviews.filter(r => allowed.has(r.card_id))
  await inChunks(reviews, chunk => supabase.from('review_logs').upsert(chunk.map((r: ReviewLog) => ({
    id: r.id, card_id: r.card_id, ord: r.ord ?? 0, set_id: r.set_id, rating: r.rating, state: r.state,
    elapsed_days: r.elapsed_days, last_scheduled_days: r.last_scheduled_days, scheduled_days: r.scheduled_days,
    stability: r.stability, difficulty: r.difficulty, review_ms: r.review_ms, reviewed_at: r.reviewed_at,
  })), { onConflict: 'id', ignoreDuplicates: true }))

  if (bundle.library.settings && !(await supabaseStore.getSettings().catch(() => null))) {
    await supabaseStore.saveSettings(bundle.library.settings).catch(() => {})
  }
  return result
}
