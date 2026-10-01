'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import { IS_DESKTOP, inTauri } from '@/lib/platform'

// Desktop: what the library folder is, and switching to a different one
export default function LibraryFolder() {
  const [root, setRoot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (IS_DESKTOP) import('@/lib/store/desktop').then(m => setRoot(m.libraryRoot()))
  }, [])

  async function changeFolder() {
    setBusy(true)
    try {
      const { pickLibraryFolder, openLibrary } = await import('@/lib/store/desktop')
      const picked = await pickLibraryFolder()
      // A full load, so every page reads the new library
      if (picked && openLibrary(picked)) window.location.assign('/')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors" aria-label="Back">←</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Library folder</h1>
      </div>

      <div className="space-y-5">
        {IS_DESKTOP && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Open now</p>
            <p className="font-mono text-sm text-gray-800 dark:text-gray-100 break-all">{root ?? '—'}</p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 text-sm text-gray-600 dark:text-gray-300 space-y-3">
          <p className="text-pretty">
            The desktop app keeps everything in an ordinary folder on your computer, called your library. That includes
            your sets and collections, cards, images, study progress, and history. There’s no account and nothing is stored online.
          </p>
          <p className="font-semibold text-gray-800 dark:text-gray-100">Inside the folder:</p>
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-300 dark:marker:text-gray-600">
            <li><span className="font-mono text-xs">library.json</span>: your collections</li>
            <li><span className="font-mono text-xs">sets/</span>: one folder per set, with its cards, progress and sessions</li>
            <li><span className="font-mono text-xs">images/</span>: pictures used in cards</li>
            <li><span className="font-mono text-xs">reviews/</span>: every rating, by month (for Stats)</li>
          </ul>
          <p className="font-semibold text-gray-800 dark:text-gray-100">Opening a different folder</p>
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-300 dark:marker:text-gray-600">
            <li>An <span className="font-semibold text-gray-800 dark:text-gray-100">empty folder</span> starts a new, empty library. Use it to keep separate libraries, say one for each class.</li>
            <li>A folder that <span className="font-semibold text-gray-800 dark:text-gray-100">already holds a library</span> opens it, such as one copied from another computer or synced with OneDrive or Dropbox.</li>
            <li>The library you’re leaving <span className="font-semibold text-gray-800 dark:text-gray-100">stays where it is</span>, untouched. Come back here and choose it again to switch back.</li>
          </ul>
          <p className="text-pretty">
            <span className="font-semibold text-gray-800 dark:text-gray-100">Tip:</span> a library inside OneDrive, Dropbox or iCloud Drive is backed up automatically.
            To move your library, close the app, move the folder, then open it here.
            Only use it from one computer at a time; two computers editing at once can overwrite each other’s changes.
          </p>
        </div>

        {IS_DESKTOP ? (
          <button
            onClick={changeFolder}
            disabled={busy || !inTauri()}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-2xl font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50"
          >
            <FolderOpen size={18} /> Choose a different folder
          </button>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center text-pretty">
            Library folders are part of the desktop app. Get it from the card at the bottom of the sidebar on a computer.
          </p>
        )}
      </div>
    </div>
  )
}
