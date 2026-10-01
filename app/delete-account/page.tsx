'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Download, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useUser } from '@/components/AuthGuard'
import { IS_DESKTOP } from '@/lib/platform'

const CONFIRM_WORD = 'DELETE'

// Web: deleting your account and everything in it (the delete_my_account RPC removes the auth user;
// sets, cards, progress, history, settings, profile and friends cascade with it)
export default function DeleteAccount() {
  const user = useUser()
  const [typed, setTyped] = useState('')
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  async function deleteAccount() {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      setError(`Could not delete your account: ${error.message}`)
      setBusy(false)
      return
    }
    // The session is no longer valid; clear what this device remembers and go to the front page
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith('fc_')) localStorage.removeItem(key)
    } catch {}
    await supabase.auth.signOut({ scope: 'local' })
    window.location.replace('/login')
  }

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors" aria-label="Back">←</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Delete account</h1>
      </div>

      {IS_DESKTOP ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">The desktop app has no account. To remove it, use Uninstall in the ⋯ menu.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300 text-pretty">
            This permanently deletes the account <span className="font-medium text-gray-900 dark:text-gray-100">{user?.email}</span> and
            everything in it: your sets and collections (including ones you shared), cards, progress, review history, stats,
            settings, and friends. Copies other people made of your sets stay theirs. This can&apos;t be undone.
          </p>

          <Link
            href="/library/export"
            className="flex items-center gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
          >
            <Download size={18} className="text-indigo-500 flex-shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-200 text-pretty">
              <span className="font-medium">Keep a copy first?</span> Export your library as a zip. The free desktop app can import it.
            </span>
          </Link>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
              Type <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{CONFIRM_WORD}</span> to confirm
            </label>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 outline-none focus:border-red-500"
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
            <button
              onClick={deleteAccount}
              disabled={busy || typed.trim().toUpperCase() !== CONFIRM_WORD}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-40"
            >
              <Trash2 size={16} /> {busy ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
