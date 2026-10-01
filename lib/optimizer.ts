// FSRS parameter optimization from the review log, with fsrs-rs (Anki's optimizer) compiled to
// WebAssembly (fsrs-browser). It trains on several threads, which browsers only allow on a
// cross-origin isolated page: /optimize is served with COOP/COEP headers (next.config.ts on the
// web, tauri.conf.json in the desktop app). Check `canOptimize()` first.
import { createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade } from 'ts-fsrs'
import { newDayHour, studyDayKey } from '@/lib/day'
import type { ReviewLog } from '@/lib/types'

export const canOptimize = () => typeof window !== 'undefined' && window.crossOriginIsolated === true

// Below this many reviews the result is mostly noise (Anki suggests optimizing after ~400)
export const MIN_REVIEWS = 400

type FsrsModule = typeof import('fsrs-browser')
let loading: Promise<FsrsModule> | null = null

function load(): Promise<FsrsModule> {
  loading ??= (async () => {
    const mod = await import('fsrs-browser')
    await mod.default()
    await mod.initThreadPool(Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 8)))
    return mod
  })()
  return loading
}

export async function defaultParameters(): Promise<number[]> {
  const mod = await load()
  return Array.from(mod.DEFAULT_PARAMETERS())
}

// Anki's revlog columns: card id, rating, review time (ms, unique per card), and kind (0 learning,
// 1 review, 2 relearning), in card then time order
function revlogColumns(reviews: ReviewLog[]) {
  const sorted = [...reviews].sort((a, b) => a.card_id.localeCompare(b.card_id) || a.reviewed_at.localeCompare(b.reviewed_at))
  const cardIndex = new Map<string, number>()
  const cids = new BigInt64Array(sorted.length)
  const ids = new BigInt64Array(sorted.length)
  const eases = new Uint8Array(sorted.length)
  const types = new Uint8Array(sorted.length)
  let lastCard = '', lastTime = 0
  sorted.forEach((r, i) => {
    if (!cardIndex.has(r.card_id)) cardIndex.set(r.card_id, cardIndex.size + 1)
    let t = new Date(r.reviewed_at).getTime()
    if (r.card_id === lastCard && t <= lastTime) t = lastTime + 1
    lastCard = r.card_id
    lastTime = t
    cids[i] = BigInt(cardIndex.get(r.card_id)!)
    ids[i] = BigInt(t)
    eases[i] = r.rating
    types[i] = r.state === State.Review ? 1 : r.state === State.Relearning ? 2 : 0
  })
  return { cids, ids, eases, types, cards: cardIndex.size }
}

export async function computeParameters(reviews: ReviewLog[]): Promise<number[]> {
  const mod = await load()
  const { cids, ids, eases, types } = revlogColumns(reviews)
  // The user's offset from UTC, minus when their day starts (both in minutes)
  const minuteOffset = -new Date().getTimezoneOffset() - newDayHour() * 60
  const fsrs = new mod.Fsrs()
  try {
    const params = fsrs.computeParametersAnki(minuteOffset, cids, eases, ids, types, undefined, true)
    return Array.from(params, n => Math.round(n * 10_000) / 10_000)
  } finally {
    fsrs.free()
  }
}

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
