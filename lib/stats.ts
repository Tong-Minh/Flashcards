// The numbers behind the Stats page, from cards (with progress), the review log, and the session
// totals recorded before the log existed. Days are study days (starting 4 AM, lib/day.ts).
import { fsrs, State } from 'ts-fsrs'
import { studyDayKey, studyDayStart } from '@/lib/day'
import { MATURE_DAYS, progressToFSRS } from '@/lib/srs'
import type { CardProgress, FlashcardWithProgress, ReviewLog, StudyHistoryEntry } from '@/lib/types'

const DAY_MS = 86_400_000
const scheduler = fsrs()

const isSuspended = (p: CardProgress | null) => !!p?.suspended
const isBuried    = (p: CardProgress | null, now: Date) => !!p?.buried_until && new Date(p.buried_until) > now

// The last `n` study days, oldest first, as YYYY-MM-DD
export function lastDays(n: number, now = new Date()): string[] {
  const start = studyDayStart(now)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() - (n - 1 - i))
    return studyDayKey(d)
  })
}

// ── Cards ─────────────────────────────────────────────────────────────────────

export interface CardCounts { new: number; learning: number; young: number; mature: number; suspended: number; buried: number; total: number }

export function cardCounts(cards: FlashcardWithProgress[], now = new Date()): CardCounts {
  const c: CardCounts = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0, buried: 0, total: cards.length }
  for (const { progress: p } of cards) {
    if (isSuspended(p)) { c.suspended++; continue }
    if (isBuried(p, now)) c.buried++
    const state = p?.fsrs_state ?? State.New
    if (state === State.New) c.new++
    else if (state === State.Review) (p!.scheduled_days >= MATURE_DAYS ? c.mature++ : c.young++)
    else c.learning++
  }
  return c
}

// Cards due on each of the next `days` days (index 0 is today, including anything overdue)
export function forecast(cards: FlashcardWithProgress[], days: number, now = new Date()): number[] {
  const counts = new Array<number>(days).fill(0)
  const today = studyDayStart(now).getTime()
  for (const { progress: p } of cards) {
    if (!p || isSuspended(p) || (p.fsrs_state ?? 0) === State.New) continue
    const i = Math.max(0, Math.floor((studyDayStart(new Date(p.due)).getTime() - today) / DAY_MS + 0.5))
    if (i < days) counts[i]++
  }
  return counts
}

export interface Histogram { labels: string[]; counts: number[] }

function histogram(values: number[], edges: number[], labels: string[]): Histogram {
  const counts = new Array<number>(labels.length).fill(0)
  for (const v of values) {
    let i = edges.findIndex(e => v < e)
    if (i < 0) i = labels.length - 1
    counts[i]++
  }
  return { labels, counts }
}

const DAY_EDGES  = [1, 2, 4, 8, 15, 31, 61, 121, 366]
const DAY_LABELS = ['<1d', '1d', '2–3d', '4–7d', '1–2w', '2–4w', '1–2mo', '2–4mo', '4–12mo', '1y+']

// Interval, stability, difficulty and retrievability spreads over studied cards
export function cardHistograms(cards: FlashcardWithProgress[], now = new Date()) {
  const studied = cards.map(c => c.progress).filter((p): p is CardProgress => !!p && !isSuspended(p) && (p.fsrs_state ?? 0) !== State.New)
  return {
    interval:       histogram(studied.map(p => p.scheduled_days), DAY_EDGES, DAY_LABELS),
    stability:      histogram(studied.map(p => p.stability), DAY_EDGES, DAY_LABELS),
    difficulty:     histogram(studied.map(p => p.difficulty), [2, 3, 4, 5, 6, 7, 8, 9, 10.01], ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']),
    retrievability: histogram(
      studied.map(p => scheduler.get_retrievability(progressToFSRS(p), now, false) * 100),
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100.01],
      ['0–10%', '10–20%', '20–30%', '30–40%', '40–50%', '50–60%', '60–70%', '70–80%', '80–90%', '90–100%'],
    ),
    count: studied.length,
    averages: studied.length ? {
      difficulty:     studied.reduce((n, p) => n + p.difficulty, 0) / studied.length,
      stability:      studied.reduce((n, p) => n + p.stability, 0) / studied.length,
      retrievability: studied.reduce((n, p) => n + scheduler.get_retrievability(progressToFSRS(p), now, false), 0) / studied.length,
    } : null,
  }
}

// ── Activity per day ─────────────────────────────────────────────────────────

export interface DayActivity {
  reviews: number
  ms: number
  // Reviews by the card's state before them: new, learning, review, relearning
  byState: [number, number, number, number]
  // From session totals recorded before the review log (no breakdown)
  fromHistory: boolean
}

// Reviews per study day from the log; days before the log's first entry come from session totals
export function dailyActivity(reviews: ReviewLog[], history: StudyHistoryEntry[]): Map<string, DayActivity> {
  const days = new Map<string, DayActivity>()
  for (const r of reviews) {
    const key = studyDayKey(r.reviewed_at)
    const d = days.get(key) ?? { reviews: 0, ms: 0, byState: [0, 0, 0, 0], fromHistory: false }
    d.reviews++
    d.ms += r.review_ms ?? 0
    d.byState[Math.min(3, Math.max(0, r.state))]++
    days.set(key, d)
  }
  const firstLogged = reviews.length ? studyDayKey(reviews[0].reviewed_at) : null
  for (const h of history) {
    const key = /^\d{4}-\d{2}-\d{2}$/.test(h.at) ? h.at : studyDayKey(h.at)
    if (firstLogged && key >= firstLogged) continue
    const d = days.get(key) ?? { reviews: 0, ms: 0, byState: [0, 0, 0, 0], fromHistory: true }
    d.reviews += h.cards
    d.ms += h.seconds * 1000
    days.set(key, d)
  }
  return days
}

// Consecutive study days up to today (or yesterday, if today has nothing yet), the longest run, and
// how many days had any study
export function streaks(days: Map<string, DayActivity>, now = new Date()) {
  const studied = new Set([...days].filter(([, d]) => d.reviews > 0).map(([k]) => k))
  const sorted = [...studied].sort()
  let longest = 0, run = 0, prev: string | null = null
  for (const key of sorted) {
    run = prev && nextKey(prev) === key ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = key
  }
  let current = 0
  let key = studyDayKey(now)
  if (!studied.has(key)) key = prevKey(key)
  while (studied.has(key)) { current++; key = prevKey(key) }
  return { current, longest, daysStudied: studied.size }
}

function shiftKey(key: string, by: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d + by, 12)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const nextKey = (key: string) => shiftKey(key, 1)
const prevKey = (key: string) => shiftKey(key, -1)

// ── Review outcomes ──────────────────────────────────────────────────────────

export interface PassRate { passed: number; total: number }
const rate = (rs: ReviewLog[]): PassRate => ({ passed: rs.filter(r => r.rating > 1).length, total: rs.length })

// True retention (Anki's table): how often a review card was remembered, for young cards (interval
// under 21 days), mature ones, and both, over several periods
export function retentionTable(reviews: ReviewLog[], now = new Date()) {
  const review = reviews.filter(r => r.state === State.Review)
  const today = studyDayStart(now).getTime()
  const since = (days: number) => today - (days - 1) * DAY_MS
  const periods: { label: string; from: number; to?: number }[] = [
    { label: 'Today',        from: today },
    { label: 'Yesterday',    from: today - DAY_MS, to: today },
    { label: 'Last 7 days',  from: since(7) },
    { label: 'Last 30 days', from: since(30) },
    { label: 'Last year',    from: since(365) },
    { label: 'All time',     from: 0 },
  ]
  return periods.map(({ label, from, to }) => {
    const rs = review.filter(r => { const t = new Date(r.reviewed_at).getTime(); return t >= from && (to === undefined || t < to) })
    return {
      label,
      young:  rate(rs.filter(r => r.last_scheduled_days < MATURE_DAYS)),
      mature: rate(rs.filter(r => r.last_scheduled_days >= MATURE_DAYS)),
      all:    rate(rs),
    }
  })
}

// How often each rating (Again, Hard, Good, Easy) was pressed, by kind of card
export function answerButtons(reviews: ReviewLog[], fromMs = 0) {
  const groups = { learning: [0, 0, 0, 0], young: [0, 0, 0, 0], mature: [0, 0, 0, 0] }
  for (const r of reviews) {
    if (new Date(r.reviewed_at).getTime() < fromMs) continue
    const g = r.state !== State.Review ? groups.learning : r.last_scheduled_days >= MATURE_DAYS ? groups.mature : groups.young
    g[r.rating - 1]++
  }
  return groups
}

// Today at a glance
export function todaySummary(reviews: ReviewLog[], now = new Date()) {
  const key = studyDayKey(now)
  const rs = reviews.filter(r => studyDayKey(r.reviewed_at) === key)
  const review = rs.filter(r => r.state === State.Review)
  return {
    reviews: rs.length,
    minutes: rs.reduce((n, r) => n + (r.review_ms ?? 0), 0) / 60_000,
    again:   rs.filter(r => r.rating === 1).length,
    newCards: rs.filter(r => r.state === State.New).length,
    retention: review.length ? review.filter(r => r.rating > 1).length / review.length : null,
  }
}
