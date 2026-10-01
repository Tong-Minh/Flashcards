// FSRS parameter optimization from the review log, with fsrs-rs (Anki's optimizer). Two ways to run
// the same optimizer on the same input:
// - Desktop app: natively, through the `optimize_fsrs` Tauri command (src-tauri/src/lib.rs).
// - Web (and the desktop app if that fails): fsrs-rs compiled to WebAssembly (fsrs-browser). It
//   trains on several threads, which browsers only allow on a cross-origin isolated page: /optimize
//   is served with COOP/COEP headers (next.config.ts; tauri.conf.json for the desktop app). The
//   Mac app's WebKit window doesn't honor them, which is why the native path exists.
import { createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade } from 'ts-fsrs'
import { studyDayKey } from '@/lib/day'
import { inTauri } from '@/lib/platform'
import type { ReviewLog } from '@/lib/types'

const isolated = () => typeof window !== 'undefined' && window.crossOriginIsolated === true

export const canOptimize = () => inTauri() || isolated()

// Below this many reviews the result is mostly noise (Anki suggests optimizing after ~400)
export const MIN_REVIEWS = 400

// ── Review log → training items (Anki's conversion, from fsrs-rs's convertor) ─────────────────

// The training set as flat arrays: each item is a card's history up to one review (its rating and
// the days since the review before), `lengths` long, with the card it came from
export interface TrainingItems {
  ratings: number[]
  deltas: number[]
  lengths: number[]
  cardIds: number[]
}

const dayNumber = (at: string) => {
  const [y, m, d] = studyDayKey(at).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

export function trainingItems(reviews: ReviewLog[]): TrainingItems {
  const byCard = new Map<string, ReviewLog[]>()
  for (const r of reviews) {
    const list = byCard.get(r.card_id)
    if (list) list.push(r)
    else byCard.set(r.card_id, [r])
  }
  const items: { at: string; card: number; reviews: { rating: number; delta: number }[] }[] = []
  let cardNo = 0
  for (const list of byCard.values()) {
    cardNo++
    list.sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at))
    // Keep the history from the start of its last run of learning reviews (a card reset to new
    // starts over); a history that doesn't start with learning can't be used
    const learning = (r: ReviewLog) => r.state === State.New || r.state === State.Learning
    let start = 0
    for (let i = list.length - 1; i >= 0; i--) {
      if (learning(list[i])) start = i
      else if (start !== 0) break
    }
    if (!learning(list[start])) continue
    const kept = list.slice(start)
    const reviewsWithDelta = kept.map((r, i) => ({ rating: r.rating, delta: i === 0 ? 0 : Math.max(0, dayNumber(r.reviewed_at) - dayNumber(kept[i - 1].reviewed_at)) }))
    // One item per review a day or more after the one before, holding everything up to it
    for (let i = 1; i < kept.length; i++) {
      if (reviewsWithDelta[i].delta > 0) items.push({ at: kept[i].reviewed_at, card: cardNo, reviews: reviewsWithDelta.slice(0, i + 1) })
    }
  }
  items.sort((a, b) => a.at.localeCompare(b.at))
  const out: TrainingItems = { ratings: [], deltas: [], lengths: [], cardIds: [] }
  for (const item of items) {
    for (const r of item.reviews) { out.ratings.push(r.rating); out.deltas.push(r.delta) }
    out.lengths.push(item.reviews.length)
    out.cardIds.push(item.card)
  }
  return out
}

// ── Running the optimizer ────────────────────────────────────────────────────

type FsrsModule = typeof import('fsrs-browser')
let loading: Promise<FsrsModule> | null = null

function loadWasm(): Promise<FsrsModule> {
  loading ??= (async () => {
    const mod = await import('fsrs-browser')
    await mod.default()
    await mod.initThreadPool(Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 8)))
    return mod
  })()
  return loading
}

async function computeWithWasm(items: TrainingItems): Promise<number[]> {
  const mod = await loadWasm()
  const fsrs = new mod.Fsrs()
  try {
    return Array.from(fsrs.computeParameters(
      new Uint32Array(items.ratings), new Uint32Array(items.deltas), new Uint32Array(items.lengths),
      undefined, true, BigInt64Array.from(items.cardIds, BigInt),
    ))
  } finally {
    fsrs.free()
  }
}

async function computeNatively(items: TrainingItems): Promise<number[]> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<number[]>('optimize_fsrs', { ...items })
}

export async function computeParameters(reviews: ReviewLog[]): Promise<number[]> {
  const items = trainingItems(reviews)
  if (items.lengths.length === 0) throw new Error('None of your cards have been reviewed on two different days yet.')
  let params: number[]
  if (inTauri()) {
    try {
      params = await computeNatively(items)
    } catch (err) {
      if (!isolated()) throw err
      params = await computeWithWasm(items)
    }
  } else {
    params = await computeWithWasm(items)
  }
  return params.map(n => Math.round(n * 10_000) / 10_000)
}

// ── Scoring parameters on the user's history ─────────────────────────────────

export interface Evaluation {
  // Lower is better for both
  logLoss: number
  rmse: number
  // Reviews scored (those at least a day after the card's previous review)
  count: number
}

// How well parameters predict the user's own history: each card's reviews are replayed, and before
// every review a day or more after the last one, the predicted chance of remembering is compared
// with what happened
export function evaluate(reviews: ReviewLog[], params: number[] | null): Evaluation {
  const scheduler = fsrs(generatorParameters({ enable_fuzz: false, ...(params && { w: params }) }))
  const byCard = new Map<string, ReviewLog[]>()
  for (const r of reviews) {
    const list = byCard.get(r.card_id)
    if (list) list.push(r)
    else byCard.set(r.card_id, [r])
  }
  let loss = 0, squared = 0, count = 0
  for (const list of byCard.values()) {
    list.sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at))
    // A history that doesn't start from new (the log began mid-way) can't be replayed
    if (list[0].state !== State.New) continue
    let card: Card = createEmptyCard(new Date(list[0].reviewed_at))
    let lastDay: string | null = null
    for (const r of list) {
      const at = new Date(r.reviewed_at)
      const day = studyDayKey(at)
      if (lastDay !== null && day !== lastDay && card.state !== State.New) {
        const p = Math.min(Math.max(scheduler.get_retrievability(card, at, false), 1e-4), 1 - 1e-4)
        const y = r.rating > 1 ? 1 : 0
        loss -= y * Math.log(p) + (1 - y) * Math.log(1 - p)
        squared += (p - y) ** 2
        count++
      }
      card = scheduler.next(card, at, r.rating as Grade).card
      lastDay = day
    }
  }
  return { logLoss: count ? loss / count : NaN, rmse: count ? Math.sqrt(squared / count) : NaN, count }
}
