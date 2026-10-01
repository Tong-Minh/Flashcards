'use client'

import Link from 'next/link'
import { APP_VERSION, CHANGELOG } from '@/lib/changelog'
import { IS_DESKTOP } from '@/lib/platform'

export default function Changelog() {
  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors" aria-label="Back">←</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">What’s new</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-pretty">
        {IS_DESKTOP
          ? <>You have version <span className="font-semibold text-gray-700 dark:text-gray-200">{APP_VERSION}</span>. Updates are offered at the bottom of the sidebar when they come out.</>
          : <>The web app is always up to date. Version numbers match the desktop app’s releases (this is <span className="font-semibold text-gray-700 dark:text-gray-200">{APP_VERSION}</span>).</>}
      </p>

      <ol className="space-y-4">
        {CHANGELOG.map(r => {
          const current = r.version === APP_VERSION
          return (
            <li key={r.version} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">{r.title}</h2>
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 tabular-nums">
                  {r.version === 'Earlier' ? 'Before 0.1.0' : `v${r.version}`} · {new Date(`${r.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {current && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">Current</span>
                )}
              </div>
              <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 marker:text-gray-300 dark:marker:text-gray-600">
                {r.changes.map((c, i) => <li key={i} className="text-pretty">{c}</li>)}
              </ul>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
