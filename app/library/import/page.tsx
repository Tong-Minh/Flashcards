'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileUp } from 'lucide-react'
import { IS_DESKTOP } from '@/lib/platform'

// Desktop: adds a library zip (from the web app's Download button) to the open library folder.
// The web build shows how to get the desktop app and make a zip instead.
export default function ImportLibrary() {
  const [dragOver, setDragOver] = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [result,   setResult]   = useState<{ added: number; skipped: number } | null>(null)
  const [error,    setError]    = useState('')

  async function importZip(file: File) {
    if (busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const [{ readLibraryZip }, { importLibraryFiles }] = await Promise.all([import('@/lib/libraryZip'), import('@/lib/store/desktop')])
      setResult(await importLibraryFiles(await readLibraryZip(file)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors" aria-label="Back">←</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import a library</h1>
      </div>

      <div className="space-y-5">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 text-sm text-gray-600 dark:text-gray-300 space-y-3">
          <p className="text-pretty">
            A <span className="font-semibold text-gray-800 dark:text-gray-100">library zip</span> is a whole collection of sets packed into one file:
            your sets and collections, every card, your study progress, and your study history.
          </p>
          <p className="font-semibold text-gray-800 dark:text-gray-100">Use it to:</p>
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-300 dark:marker:text-gray-600">
            <li>bring the sets you made in the web app into this desktop app</li>
            <li>combine a library from another computer with this one</li>
          </ul>
          <p className="font-semibold text-gray-800 dark:text-gray-100">To get one from the web app:</p>
          <ol className="list-decimal pl-5 space-y-1 marker:text-gray-400">
            <li>Sign in on a computer.</li>
            <li>Click the download button (↓) at the bottom of the sidebar, next to your name.</li>
            <li>Bring the downloaded <span className="font-mono text-xs">flashcards-library-(date).zip</span> here.</li>
          </ol>
          <p className="text-pretty">
            Importing <span className="font-semibold text-gray-800 dark:text-gray-100">adds</span> the sets to this library. Nothing here is replaced or deleted.
            Sets that are already here, because you imported the same file before, are skipped, so importing twice never makes duplicates.
          </p>
        </div>

        {IS_DESKTOP ? (
          <>
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
              <span className="font-semibold text-gray-800 dark:text-gray-100">{busy ? 'Importing…' : 'Choose a library .zip'}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">or drop it here</span>
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                disabled={busy}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importZip(f) }}
              />
            </label>

            {error && <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}
            {result && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4 text-center">
                <p className="font-semibold text-green-700 dark:text-green-400">
                  Imported {result.added} set{result.added !== 1 ? 's' : ''}
                </p>
                {result.skipped > 0 && (
                  <p className="text-sm text-green-700/80 dark:text-green-400/80 mt-1">
                    {result.skipped} {result.skipped === 1 ? 'was' : 'were'} already in this library and {result.skipped === 1 ? 'was' : 'were'} skipped.
                  </p>
                )}
                {/* A full load, so every page reads the library again */}
                <a href="/" className="inline-block mt-3 bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
                  Go to My Sets
                </a>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center text-pretty">
            Importing a library is done in the desktop app. Get it from the card at the bottom of the sidebar on a computer.
          </p>
        )}
      </div>
    </div>
  )
}
