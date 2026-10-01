'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { IS_DESKTOP, inTauri } from '@/lib/platform'
import { confirmAction } from '@/lib/dialogs'

// Desktop: uninstalling the app, keeping or deleting the flashcards in the library folder
export default function Uninstall() {
  const [root,   setRoot]   = useState<string | null>(null)
  const [choice, setChoice] = useState<'keep' | 'delete'>('keep')
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)

  useEffect(() => {
    if (IS_DESKTOP) import('@/lib/store/desktop').then(m => setRoot(m.libraryRoot()))
  }, [])

  async function uninstall() {
    const sure = choice === 'delete'
      ? await confirmAction(`Uninstall Flashcards and permanently delete your flashcards in ${root ?? 'the library folder'}? This can't be undone.`)
      : await confirmAction('Uninstall Flashcards? Your flashcards stay in your library folder.')
    if (!sure) return
    setBusy(true)
    setError('')
    try {
      if (choice === 'delete') await (await import('@/lib/store/desktop')).deleteLibraryContents()
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('uninstall_app')
    } catch (err) {
      setError(typeof err === 'string' ? err : err instanceof Error ? err.message : 'Could not uninstall.')
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors" aria-label="Back">←</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Uninstall Flashcards</h1>
      </div>

      {!IS_DESKTOP ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">This is for the desktop app.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300 text-pretty">
            {isMac
              ? 'This removes the app’s settings and moves Flashcards to the Trash, then quits.'
              : 'This opens the Windows uninstaller for Flashcards and quits the app. The uninstaller can also remove the app’s settings.'}
            {' '}First, choose what happens to your flashcards:
          </p>

          {([
            ['keep', 'Keep my flashcards', 'Your library folder stays where it is, with all your sets, progress and images. Reinstall later and choose the same folder to pick up where you left off.'],
            ['delete', 'Delete my flashcards', 'Permanently deletes your sets, progress, history, images and audio from the library folder. Other files in that folder are left alone.'],
          ] as const).map(([value, title, desc]) => (
            <label
              key={value}
              className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${
                choice === value
                  ? value === 'delete' ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-700' : 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-700'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              }`}
            >
              <input type="radio" name="choice" checked={choice === value} onChange={() => setChoice(value)} className="mt-1" />
              <span>
                <span className="block font-semibold text-gray-900 dark:text-gray-100">{title}</span>
                <span className="block text-sm text-gray-500 dark:text-gray-400 mt-0.5 text-pretty">{desc}</span>
              </span>
            </label>
          ))}

          {root && <p className="text-xs text-gray-400 dark:text-gray-500 break-all">Library folder: <span className="font-mono">{root}</span></p>}
          {!inTauri() && <p className="text-xs text-amber-600">Uninstalling only works in the installed app.</p>}

          <button
            onClick={uninstall}
            disabled={busy || !inTauri()}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white transition-colors disabled:opacity-50 ${choice === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600'}`}
          >
            <Trash2 size={18} /> {busy ? 'Uninstalling…' : choice === 'delete' ? 'Delete my flashcards and uninstall' : 'Uninstall, keep my flashcards'}
          </button>
          {error && <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}
        </div>
      )}
    </div>
  )
}
