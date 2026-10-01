'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileUp } from 'lucide-react'
import { useUser } from '@/components/AuthGuard'
import { IS_DESKTOP } from '@/lib/platform'
import type { ImportResult } from '@/lib/libraryTransfer'

// Adds a library zip (from Export a library in either app) to this library
export default function ImportLibrary() {
  const user = useUser()
  const [dragOver, setDragOver] = useState(false)
  const [busy,     setBusy]     = useState<string | null>(null)
  const [result,   setResult]   = useState<ImportResult | null>(null)
  const [error,    setError]    = useState('')

  async function importZip(file: File) {
    if (busy || !user) return
    setBusy('Reading…')
    setError('')
    setResult(null)
    try {
      const { readLibraryZip } = await import('@/lib/libraryTransfer')
      const bundle = await readLibraryZip(file)
      setBusy('Importing…')
      setResult(IS_DESKTOP
        ? await (await import('@/lib/store/desktop')).importBundle(bundle)
        : await (await import('@/lib/webLibrary')).importWebBundle(bundle, user.id, (n, total) => setBusy(`Importing ${n}/${total}…`)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that file.')
    } finally {
      setBusy(null)
    }
  }

  const n = (count: number, word: string) => `${count} ${word}${count !== 1 ? 's' : ''}`

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors" aria-label="Back">←</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import a library</h1>
      </div>

      <div className="space-y-5">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 text-sm text-gray-600 dark:text-gray-300 space-y-3">
          <p className="text-pretty">
            A <span className="font-semibold text-gray-800 dark:text-gray-100">library zip</span> holds sets packed into one file: their cards and collections,
            study progress, review history, and study settings{IS_DESKTOP ? ', plus images' : ''}.
          </p>
          <p className="font-semibold text-gray-800 dark:text-gray-100">To get one:</p>
          <ol className="list-decimal pl-5 space-y-1 marker:text-gray-400">
            <li>In the other app ({IS_DESKTOP ? 'the web app, or this app on another computer' : 'the desktop app'}), click <span className="font-semibold text-gray-800 dark:text-gray-100">Export</span> (↓) at the bottom of the sidebar.</li>
            <li>Choose the sets and save the zip.</li>
            <li>Bring the <span className="font-mono text-xs">flashcards-library-(date).zip</span> here.</li>
          </ol>
          <p className="font-semibold text-gray-800 dark:text-gray-100">What importing does</p>
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-300 dark:marker:text-gray-600">
            <li>Adds sets, collections and cards that aren’t here yet. <span className="font-semibold text-gray-800 dark:text-gray-100">Nothing here is deleted or overwritten.</span></li>
            <li>For cards you’ve studied in both places, keeps whichever progress is more recent.</li>
            <li>Adds the review history, so Stats includes it.</li>
            {!IS_DESKTOP && <li>Images stay behind (the web app shows a placeholder), and sets over 3,000 cards are split into parts.</li>}
            <li>Importing the same zip twice is safe: the second time just finds nothing new.</li>
          </ul>
        </div>

        <label
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) importZip(f) }}
          className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800'
          }`}
        >
          <FileUp size={28} className="text-indigo-500" />
          <span className="font-semibold text-gray-800 dark:text-gray-100">{busy ?? 'Choose a library .zip'}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">or drop it here</span>
          <input
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            disabled={!!busy}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importZip(f) }}
          />
        </label>

        {error && <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}
        {result && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4 text-center">
            <p className="font-semibold text-green-700 dark:text-green-400">
              {result.added || result.updated ? 'Imported' : 'Nothing new to import'}
            </p>
            <p className="text-sm text-green-700/80 dark:text-green-400/80 mt-1">
              {[
                result.added && `${n(result.added, 'new set')}`,
                result.updated && `${n(result.updated, 'set')} brought up to date`,
                result.unchanged && `${n(result.unchanged, 'set')} already up to date`,
                result.split && `${n(result.split, 'set')} split into parts (over 3,000 cards)`,
              ].filter(Boolean).join(' · ')}
            </p>
            {/* A full load, so every page reads the library again */}
            <a href="/" className="inline-block mt-3 bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
              Go to your library
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
