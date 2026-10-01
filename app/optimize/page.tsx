'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { store } from '@/lib/store'
import { cachedSettings, loadSettings, saveSettings } from '@/lib/studySettings'
import { canOptimize, computeParameters, evaluate, MIN_REVIEWS, type Evaluation } from '@/lib/optimizer'
import type { ReviewLog, StudySettings } from '@/lib/types'
import { paths } from '@/lib/paths'

// Fits FSRS parameters to the user's review log. Served with cross-origin isolation headers (the
// optimizer needs threads), so it's reached by a full page load and has no sidebar: links out are
// plain <a>s, which leave the isolated page.
export default function Optimize() {
  const [settings, setSettings] = useState<StudySettings>(cachedSettings)
  const [reviews,  setReviews]  = useState<ReviewLog[] | null>(null)
  const [phase,    setPhase]    = useState<'idle' | 'running' | 'done' | 'saved'>('idle')
  const [result,   setResult]   = useState<{ params: number[]; before: Evaluation; after: Evaluation } | null>(null)
  const [error,    setError]    = useState('')
  const [isolated, setIsolated] = useState(true)

  useEffect(() => {
    setIsolated(canOptimize())
    loadSettings().then(setSettings)
    store.getReviews().then(setReviews).catch(() => setError('Could not load your reviews. Check your connection and try again.'))
  }, [])

  async function run() {
    if (!reviews) return
    setPhase('running')
    setError('')
    // Let the "Optimizing…" state paint before the work starts
    await new Promise(r => setTimeout(r, 50))
    try {
      const params = await computeParameters(reviews)
      setResult({ params, before: evaluate(reviews, settings.fsrsParams), after: evaluate(reviews, params) })
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error && err.message ? `The optimizer stopped: ${err.message}` : 'The optimizer could not run on these reviews.')
      setPhase('idle')
    }
  }

  async function keep() {
    if (!result || !reviews) return
    try {
      await saveSettings({ fsrsParams: result.params, optimizedAt: new Date().toISOString(), reviewsAtOptimize: reviews.length })
      setPhase('saved')
    } catch {
      setError('Could not save the new parameters. Please try again.')
    }
  }

  const cards = reviews ? new Set(reviews.map(r => r.card_id)).size : 0
  const better = result && result.after.logLoss < result.before.logLoss
  const change = result ? ((result.before.logLoss - result.after.logLoss) / result.before.logLoss) * 100 : 0

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:py-10">
      <div className="flex items-center gap-3 mb-5">
        <a href={paths.settings} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors" aria-label="Back">←</a>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Optimize FSRS</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 text-sm text-gray-600 dark:text-gray-300 space-y-3 mb-5">
        <p className="text-pretty">
          This fits FSRS to how <span className="font-semibold text-gray-800 dark:text-gray-100">you</span> remember, using every rating in your review log.
          It runs on this device with the same optimizer Anki uses, and nothing leaves your computer.
        </p>
        <p className="text-pretty">
          Afterwards you’ll see how well the current and new parameters predict your past reviews, and choose which to keep.
          New parameters apply from each card’s next review; nothing is rescheduled right away.
        </p>
      </div>

      {!isolated ? (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-800 dark:text-amber-300 text-pretty">
          This window can’t run the optimizer: it needs a browser feature (cross-origin isolation) that isn’t available here.
          Try reloading this page. If that doesn’t help, optimize in the web app in Chrome, Edge, Firefox or Safari.
        </div>
      ) : reviews === null ? (
        <p className="text-center text-gray-400 dark:text-gray-500 py-10">{error || 'Loading your reviews…'}</p>
      ) : phase === 'saved' ? (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-5 text-center">
          <p className="font-semibold text-green-700 dark:text-green-400">Saved. Your next reviews use the new parameters.</p>
          <a href={paths.settings} className="inline-block mt-3 bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">Back to settings</a>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <p className="text-gray-800 dark:text-gray-100">
              <span className="font-semibold">{reviews.length.toLocaleString()}</span> reviews of <span className="font-semibold">{cards.toLocaleString()}</span> cards
            </p>
            {reviews.length < MIN_REVIEWS && (
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1 text-pretty">
                That’s not many yet. Optimizing works best after about {MIN_REVIEWS} reviews, and with fewer the defaults are often better
                (you’ll see the comparison before anything changes).
              </p>
            )}
            {phase !== 'done' && (
              <button
                onClick={run}
                disabled={phase === 'running' || reviews.length === 0}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <Sparkles size={17} className={phase === 'running' ? 'animate-pulse' : ''} />
                {phase === 'running' ? 'Optimizing…' : 'Optimize'}
              </button>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>}
          </div>

          {result && phase === 'done' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">How well each predicts your reviews</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Scored on {result.after.count.toLocaleString()} reviews a day or more after the previous one. Lower is better.</p>
              <table className="w-full text-sm tabular-nums mb-4">
                <thead>
                  <tr className="text-xs text-gray-400 dark:text-gray-500">
                    <th className="text-left font-medium pb-2"></th>
                    <th className="text-right font-medium pb-2">Log loss</th>
                    <th className="text-right font-medium pb-2">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  <tr>
                    <td className="py-1.5 text-gray-600 dark:text-gray-300">{settings.fsrsParams ? 'Current (optimized)' : 'Current (defaults)'}</td>
                    <td className="py-1.5 text-right">{fmt(result.before.logLoss)}</td>
                    <td className="py-1.5 text-right">{pct(result.before.rmse)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-1.5 text-gray-800 dark:text-gray-100">New</td>
                    <td className="py-1.5 text-right">{fmt(result.after.logLoss)}</td>
                    <td className="py-1.5 text-right">{pct(result.after.rmse)}</td>
                  </tr>
                </tbody>
              </table>
              <p className={`text-sm mb-4 text-pretty ${better ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {result.after.count === 0
                  ? 'There aren’t enough reviews spaced a day apart to compare them yet.'
                  : better
                    ? `The new parameters fit your history ${change.toFixed(1)}% better.`
                    : 'The new parameters don’t fit your history better than the current ones. Keeping the current ones is recommended.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={keep}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${better ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  Use the new parameters
                </button>
                <a
                  href={paths.settings}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${better ? 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  Keep the current ones
                </a>
              </div>
              <p className="mt-4 text-[11px] font-mono text-gray-400 dark:text-gray-500 break-all">{result.params.join(', ')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : '—')
const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—')
