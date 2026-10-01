'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { store } from '@/lib/store'
import { cachedSettings, loadSettings, RETENTION_CHOICES, saveSettings } from '@/lib/studySettings'
import { MIN_REVIEWS } from '@/lib/optimizer'
import { confirmAction, notify } from '@/lib/dialogs'
import { paths } from '@/lib/paths'
import { IS_DESKTOP } from '@/lib/platform'
import type { StudySettings } from '@/lib/types'

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })

export default function StudySettingsPage() {
  const [settings, setSettings] = useState<StudySettings>(cachedSettings)
  const [reviews,  setReviews]  = useState<number | null>(null)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    loadSettings().then(setSettings)
    store.getReviews().then(r => setReviews(r.length)).catch(() => {})
  }, [])

  async function update(patch: Partial<StudySettings>) {
    const previous = settings
    setSettings({ ...settings, ...patch })
    setSaving(true)
    try {
      setSettings(await saveSettings(patch))
    } catch {
      setSettings(previous)
      notify('Could not save your settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function resetParameters() {
    if (!await confirmAction('Go back to the default FSRS parameters? Your cards keep their current schedules.')) return
    update({ fsrsParams: null, optimizedAt: null })
  }

  const sinceOptimize = reviews === null ? null : reviews - settings.reviewsAtOptimize
  const suggestOptimize = sinceOptimize !== null && sinceOptimize >= MIN_REVIEWS

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors" aria-label="Back">←</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex-1">Study settings</h1>
        {saving && <span className="text-xs text-gray-400 dark:text-gray-500">Saving…</span>}
      </div>

      <div className="space-y-4">
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Target retention</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-3 text-pretty">
            How likely you should be to remember a card when it comes back for review. Higher means cards come back sooner,
            so more reviews: 95% is roughly twice the work of 90%. Each set can override this in its settings.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {RETENTION_CHOICES.map(r => (
              <button
                key={r}
                onClick={() => update({ desiredRetention: r })}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                  settings.desiredRetention === r
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {Math.round(r * 100)}%{r === 0.9 ? ' (default)' : ''}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">New day starts at</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-3 text-pretty">
            When “today” rolls over: daily new-card limits reset, buried cards come back, and stats start a new day.
            After midnight is usually best, so a late-night session counts as the same day.
          </p>
          <select
            value={settings.newDayHour}
            onChange={e => update({ newDayHour: Number(e.target.value) })}
            className="border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500"
          >
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </section>

        {IS_DESKTOP && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <span>
                <span className="block font-semibold text-gray-900 dark:text-gray-100">Play audio automatically</span>
                <span className="block text-sm text-gray-500 dark:text-gray-400 mt-1 text-pretty">
                  A card’s sound clips play when it appears, and the answer’s when you reveal it, like Anki. Press R to replay.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.autoplayAudio}
                onChange={e => update({ autoplayAudio: e.target.checked })}
                className="mt-1 w-5 h-5 rounded text-indigo-600 flex-shrink-0"
              />
            </label>
          </section>
        )}

        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">FSRS parameters</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-3 text-pretty">
            FSRS predicts when you’ll forget each card using 21 numbers. The defaults are fitted to millions of Anki users;
            optimizing fits them to your own reviews, which usually schedules your cards more accurately.
          </p>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-700/40 px-4 py-3 text-sm mb-3">
            <p className="font-medium text-gray-800 dark:text-gray-100">
              {settings.fsrsParams
                ? <>Optimized {settings.optimizedAt ? new Date(settings.optimizedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''} from {settings.reviewsAtOptimize.toLocaleString()} reviews</>
                : 'Using the defaults'}
            </p>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">
              {reviews === null ? 'Counting your reviews…' : <>
                {reviews.toLocaleString()} reviews logged
                {settings.fsrsParams && sinceOptimize !== null ? ` · ${sinceOptimize.toLocaleString()} since optimizing` : ''}
              </>}
            </p>
          </div>
          {suggestOptimize && (
            <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-3">
              {settings.fsrsParams ? 'You’ve done enough new reviews that optimizing again is worthwhile.' : 'You have enough reviews to optimize.'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={paths.optimize}
              className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              <Sparkles size={15} /> Optimize…
            </a>
            {settings.fsrsParams && (
              <button
                onClick={resetParameters}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Use defaults
              </button>
            )}
          </div>
          {settings.fsrsParams && (
            <p className="mt-3 text-[11px] font-mono text-gray-400 dark:text-gray-500 break-all">{settings.fsrsParams.join(', ')}</p>
          )}
        </section>
      </div>
    </div>
  )
}
