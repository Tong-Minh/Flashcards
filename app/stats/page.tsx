'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/components/AuthGuard'
import { store } from '@/lib/store'
import { paths } from '@/lib/paths'
import {
  answerButtons, cardCounts, cardHistograms, dailyActivity, forecast, lastDays, retentionTable, streaks, todaySummary,
  type PassRate,
} from '@/lib/stats'
import { BarChart, Heatmap, Legend, Segmented, StackedBar, StatsSection } from '@/components/stats/Charts'
import type { Collection, FlashcardWithProgress, ReviewLog, StudyHistoryEntry } from '@/lib/types'
import type { SetWithStats } from '@/lib/store/types'

// Colors for card kinds, shared by the charts and their legends
const C = {
  new:       'bg-blue-400 dark:bg-blue-500',
  learning:  'bg-amber-400 dark:bg-amber-500',
  young:     'bg-emerald-300 dark:bg-emerald-600',
  mature:    'bg-emerald-600 dark:bg-emerald-400',
  relearn:   'bg-red-400 dark:bg-red-500',
  review:    'bg-emerald-500 dark:bg-emerald-500',
  suspended: 'bg-gray-300 dark:bg-gray-600',
  history:   'bg-indigo-300 dark:bg-indigo-700',
  again:     'bg-red-400 dark:bg-red-500',
  hard:      'bg-orange-400 dark:bg-orange-500',
  good:      'bg-indigo-500 dark:bg-indigo-400',
  easy:      'bg-green-500 dark:bg-green-400',
}

export default function StatsPage() {
  return (
    <Suspense fallback={null}>
      <Stats />
    </Suspense>
  )
}

interface Data {
  cards: FlashcardWithProgress[]
  reviews: ReviewLog[]
  history: StudyHistoryEntry[]
}

function Stats() {
  const user   = useUser()
  const router = useRouter()
  const params = useSearchParams()
  const setScope        = params.get('set')
  const collectionScope = params.get('collection')

  const [sets,        setSets]        = useState<SetWithStats[] | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [data,        setData]        = useState<Data | null>(null)
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (!user) return
    store.loadLibrary(user.id)
      .then(lib => { setSets(lib.sets); setCollections(lib.collections) })
      .catch(() => setError('Could not load your sets.'))
  }, [user])

  // The sets in scope: one set, a collection's sets, or all of them
  const scopeIds = useMemo(() => {
    if (!sets) return null
    if (setScope) return [setScope]
    if (collectionScope) return sets.filter(s => s.collection_id === collectionScope).map(s => s.id)
    return sets.map(s => s.id)
  }, [sets, setScope, collectionScope])

  useEffect(() => {
    if (!scopeIds) return
    let cancelled = false
    setData(null)
    const all = !setScope && !collectionScope
    Promise.all([
      Promise.all(scopeIds.map(id => store.getCards(id))).then(lists => lists.flat()),
      store.getReviews(all ? undefined : scopeIds),
      store.getStudyHistory(all ? undefined : scopeIds),
    ])
      .then(([cards, reviews, history]) => { if (!cancelled) setData({ cards, reviews, history }) })
      .catch(() => { if (!cancelled) setError('Could not load your stats. Check your connection and try again.') })
    return () => { cancelled = true }
  }, [scopeIds, setScope, collectionScope])

  const scopeValue = setScope ? `set:${setScope}` : collectionScope ? `collection:${collectionScope}` : 'all'
  const scopeName  = setScope ? sets?.find(s => s.id === setScope)?.name
    : collectionScope ? collections.find(c => c.id === collectionScope)?.name : null

  function changeScope(value: string) {
    const [kind, id] = value.split(':')
    router.replace(paths.stats(kind === 'set' ? { set: id } : kind === 'collection' ? { collection: id } : undefined))
  }

  return (
    <div className="max-w-lg lg:max-w-6xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Link
          href={setScope ? paths.set(setScope) : collectionScope ? paths.collection(collectionScope) : '/'}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex-1 min-w-0 truncate">
          Stats{scopeName ? <span className="text-gray-400 dark:text-gray-500 font-semibold"> · {scopeName}</span> : null}
        </h1>
        <select
          value={scopeValue}
          onChange={e => changeScope(e.target.value)}
          className="max-w-full lg:max-w-xs text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-2"
          aria-label="Show stats for"
        >
          <option value="all">All sets</option>
          {collections.length > 0 && (
            <optgroup label="Collections">
              {collections.map(c => <option key={c.id} value={`collection:${c.id}`}>{c.name}</option>)}
            </optgroup>
          )}
          {sets && sets.length > 0 && (
            <optgroup label="Sets">
              {sets.map(s => <option key={s.id} value={`set:${s.id}`}>{s.name}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {error ? (
        <p className="text-center text-sm text-red-600 dark:text-red-400 py-16">{error}</p>
      ) : !data ? (
        <p className="text-center text-gray-400 dark:text-gray-500 py-16">Loading…</p>
      ) : (
        <StatsBody data={data} />
      )}
    </div>
  )
}

function StatsBody({ data }: { data: Data }) {
  const now = useMemo(() => new Date(), [data])
  const [forecastDays, setForecastDays] = useState<7 | 30 | 90>(30)
  const [historyDays,  setHistoryDays]  = useState<30 | 90 | 365>(30)
  const [historyUnit,  setHistoryUnit]  = useState<'cards' | 'minutes'>('cards')

  const counts   = useMemo(() => cardCounts(data.cards, now), [data, now])
  const today    = useMemo(() => todaySummary(data.reviews, now), [data, now])
  const days     = useMemo(() => dailyActivity(data.reviews, data.history), [data])
  const streak   = useMemo(() => streaks(days, now), [days, now])
  const due      = useMemo(() => forecast(data.cards, forecastDays, now), [data, forecastDays, now])
  const hist     = useMemo(() => cardHistograms(data.cards, now), [data, now])
  const retained = useMemo(() => retentionTable(data.reviews, now), [data, now])
  const buttons  = useMemo(() => answerButtons(data.reviews, now.getTime() - historyDays * 86_400_000), [data, historyDays, now])
  const logStart = data.reviews[0]?.reviewed_at

  const dayLabel = (key: string, long: boolean) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(undefined, long ? { month: 'short', day: 'numeric' } : { month: 'numeric', day: 'numeric' })

  const historyKeys = lastDays(historyDays, now)
  const minutes = historyUnit === 'minutes'
  const historyItems = historyKeys.map(key => {
    const d = days.get(key)
    const label = dayLabel(key, historyDays <= 30)
    if (!d) return { label, segments: [] }
    if (minutes) return { label, segments: [{ value: d.ms / 60_000, className: d.fromHistory ? C.history : C.good, label: 'min' }] }
    return {
      label,
      segments: d.fromHistory
        ? [{ value: d.reviews, className: C.history, label: 'cards (session totals)' }]
        : [
            { value: d.byState[0], className: C.new, label: 'new' },
            { value: d.byState[1], className: C.learning, label: 'learning' },
            { value: d.byState[3], className: C.relearn, label: 'relearning' },
            { value: d.byState[2], className: C.review, label: 'review' },
          ],
    }
  })
  const totalInRange = historyKeys.reduce((n, k) => n + (minutes ? (days.get(k)?.ms ?? 0) / 60_000 : days.get(k)?.reviews ?? 0), 0)
  const studiedInRange = historyKeys.filter(k => (days.get(k)?.reviews ?? 0) > 0).length

  const forecastItems = due.map((n, i) => ({
    label: i === 0 ? 'Today' : `+${i}`,
    segments: [{ value: n, className: C.review, label: 'due' }],
  }))
  const fmtMin = (m: number) => (m < 1 ? `${Math.round(m * 60)}s` : m < 60 ? `${Math.round(m)}m` : `${(m / 60).toFixed(1)}h`)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
      {/* Today */}
      <StatsSection title="Today" subtitle={logStart ? undefined : 'Ratings are logged from now on; earlier days come from session totals.'}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Reviews',   value: today.reviews },
            { label: 'Time',      value: fmtMin(today.minutes) },
            { label: 'New cards', value: today.newCards },
            { label: 'Again',     value: today.reviews ? `${Math.round((today.again / today.reviews) * 100)}%` : '—' },
          ].map(s => (
            <div key={s.label} className="rounded-xl bg-gray-50 dark:bg-gray-700/40 p-3 text-center">
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{s.value}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
          {streak.current > 0
            ? <>🔥 <span className="font-semibold text-gray-800 dark:text-gray-200">{streak.current}-day streak</span> · longest {streak.longest}</>
            : <>No streak yet{streak.longest > 0 ? ` · longest ${streak.longest} days` : ''}</>}
        </p>
      </StatsSection>

      {/* Card counts */}
      <StatsSection title="Cards" subtitle={`${counts.total} card${counts.total !== 1 ? 's' : ''}${counts.buried ? ` · ${counts.buried} buried until tomorrow` : ''}`}>
        <StackedBar parts={[
          { value: counts.new,       className: C.new,       label: 'New' },
          { value: counts.learning,  className: C.learning,  label: 'Learning' },
          { value: counts.young,     className: C.young,     label: 'Young' },
          { value: counts.mature,    className: C.mature,    label: 'Mature' },
          { value: counts.suspended, className: C.suspended, label: 'Suspended' },
        ]} />
        <Legend items={[
          { className: C.new,       label: 'New',       value: counts.new },
          { className: C.learning,  label: 'Learning',  value: counts.learning },
          { className: C.young,     label: 'Young',     value: counts.young },
          { className: C.mature,    label: 'Mature',    value: counts.mature },
          { className: C.suspended, label: 'Suspended', value: counts.suspended },
        ]} />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Young: reviewing with an interval under 21 days. Mature: 21 days or more.</p>
      </StatsSection>

      {/* Forecast */}
      <StatsSection
        title="Forecast"
        subtitle={`${due.reduce((a, b) => a + b, 0)} reviews due in the next ${forecastDays} days, ${due[0]} today`}
        right={<Segmented value={forecastDays} onChange={setForecastDays} options={[{ value: 7, label: '1w' }, { value: 30, label: '1m' }, { value: 90, label: '3m' }]} />}
      >
        <BarChart items={forecastItems} every={forecastDays === 7 ? 1 : forecastDays === 30 ? 5 : 15} />
      </StatsSection>

      {/* Calendar */}
      <StatsSection title="Calendar" subtitle={`Studied on ${streak.daysStudied} day${streak.daysStudied !== 1 ? 's' : ''}`}>
        <Heatmap days={days} now={now} />
      </StatsSection>

      {/* Reviews per day */}
      <StatsSection
        title="Reviews"
        subtitle={`${minutes ? fmtMin(totalInRange) : `${Math.round(totalInRange)} cards`} · studied ${studiedInRange} of ${historyDays} days`}
        right={
          <div className="flex flex-col sm:flex-row gap-1.5 items-end">
            <Segmented value={historyUnit} onChange={setHistoryUnit} options={[{ value: 'cards', label: 'Cards' }, { value: 'minutes', label: 'Time' }]} />
            <Segmented value={historyDays} onChange={setHistoryDays} options={[{ value: 30, label: '1m' }, { value: 90, label: '3m' }, { value: 365, label: '1y' }]} />
          </div>
        }
      >
        <BarChart items={historyItems} every={historyDays === 30 ? 5 : historyDays === 90 ? 15 : 60} format={minutes ? fmtMin : undefined} />
        {minutes ? null : (
          <Legend items={[
            { className: C.new, label: 'New' }, { className: C.learning, label: 'Learning' },
            { className: C.relearn, label: 'Relearning' }, { className: C.review, label: 'Review' },
            ...(historyItems.some(i => i.segments[0]?.className === C.history) ? [{ className: C.history, label: 'Before the log (session totals)' }] : []),
          ]} />
        )}
      </StatsSection>

      {/* True retention */}
      <StatsSection title="Retention" subtitle="How often you remembered cards you were reviewing (not learning). FSRS aims for about 90%.">
        {data.reviews.length === 0 ? (
          <EmptyNote />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500">
                  <th className="text-left font-medium pb-2"></th>
                  <th className="text-right font-medium pb-2">Young</th>
                  <th className="text-right font-medium pb-2">Mature</th>
                  <th className="text-right font-medium pb-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {retained.map(row => (
                  <tr key={row.label}>
                    <td className="py-1.5 text-gray-600 dark:text-gray-300">{row.label}</td>
                    <td className="py-1.5 text-right"><Pct r={row.young} /></td>
                    <td className="py-1.5 text-right"><Pct r={row.mature} /></td>
                    <td className="py-1.5 text-right font-semibold"><Pct r={row.all} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatsSection>

      {/* Answer buttons */}
      <StatsSection title="Answer buttons" subtitle={`Ratings in the last ${historyDays === 365 ? 'year' : `${historyDays} days`}`}>
        {data.reviews.length === 0 ? <EmptyNote /> : (
          <div className="space-y-3">
            {(['learning', 'young', 'mature'] as const).map(kind => {
              const row = buttons[kind]
              const total = row.reduce((a, b) => a + b, 0)
              return (
                <div key={kind}>
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span className="capitalize">{kind}</span>
                    <span className="tabular-nums">{total ? `${Math.round(((total - row[0]) / total) * 100)}% correct · ${total}` : '—'}</span>
                  </div>
                  <StackedBar parts={[
                    { value: row[0], className: C.again, label: 'Again' },
                    { value: row[1], className: C.hard,  label: 'Hard' },
                    { value: row[2], className: C.good,  label: 'Good' },
                    { value: row[3], className: C.easy,  label: 'Easy' },
                  ]} />
                </div>
              )
            })}
            <Legend items={[{ className: C.again, label: 'Again' }, { className: C.hard, label: 'Hard' }, { className: C.good, label: 'Good' }, { className: C.easy, label: 'Easy' }]} />
          </div>
        )}
      </StatsSection>

      {/* Card histograms */}
      <StatsSection title="Intervals" subtitle={hist.count ? `How long until each studied card comes back` : undefined}>
        {hist.count === 0 ? <EmptyNote text="Study some cards to see these." /> : (
          <BarChart items={hist.interval.labels.map((l, i) => ({ label: l, segments: [{ value: hist.interval.counts[i], className: C.young, label: 'cards' }] }))} every={2} height={110} />
        )}
      </StatsSection>

      <StatsSection title="Stability" subtitle={hist.averages ? `How long a memory lasts before it drops to 90% · average ${Math.round(hist.averages.stability)} days` : undefined}>
        {hist.count === 0 ? <EmptyNote text="Study some cards to see these." /> : (
          <BarChart items={hist.stability.labels.map((l, i) => ({ label: l, segments: [{ value: hist.stability.counts[i], className: C.mature, label: 'cards' }] }))} every={2} height={110} />
        )}
      </StatsSection>

      <StatsSection title="Difficulty" subtitle={hist.averages ? `1 is easiest, 10 hardest · average ${hist.averages.difficulty.toFixed(1)}` : undefined}>
        {hist.count === 0 ? <EmptyNote text="Study some cards to see these." /> : (
          <BarChart items={hist.difficulty.labels.map((l, i) => ({ label: l, segments: [{ value: hist.difficulty.counts[i], className: C.hard, label: 'cards' }] }))} height={110} />
        )}
      </StatsSection>

      <StatsSection title="Retrievability" subtitle={hist.averages ? `The chance you'd remember each card right now · average ${Math.round(hist.averages.retrievability * 100)}%` : undefined}>
        {hist.count === 0 ? <EmptyNote text="Study some cards to see these." /> : (
          <BarChart items={hist.retrievability.labels.map((l, i) => ({ label: l.replace('%', ''), segments: [{ value: hist.retrievability.counts[i], className: C.good, label: 'cards' }] }))} every={2} height={110} />
        )}
      </StatsSection>
    </div>
  )
}

function Pct({ r }: { r: PassRate }) {
  if (r.total === 0) return <span className="text-gray-300 dark:text-gray-600">—</span>
  return (
    <span title={`${r.passed} of ${r.total}`} className="text-gray-800 dark:text-gray-200">
      {Math.round((r.passed / r.total) * 100)}%<span className="text-xs text-gray-400 dark:text-gray-500 ml-1">{r.total}</span>
    </span>
  )
}

function EmptyNote({ text = 'Your ratings show up here once you study.' }: { text?: string }) {
  return <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">{text}</p>
}
