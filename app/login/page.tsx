'use client'

import { useEffect, useState } from 'react'
import { Apple, Download, Monitor } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

const RELEASES_PAGE  = 'https://github.com/Tong-Minh/Flashcards/releases/latest'
const LATEST_RELEASE = 'https://api.github.com/repos/Tong-Minh/Flashcards/releases/latest'

// The front page for anyone signed out: what the app is, the free desktop app to download, how to
// bring decks in, and signing in to the cloud version (for the owner and friends)
export default function Login() {
  const [loading,   setLoading]   = useState(false)
  const [downloads, setDownloads] = useState({ windows: RELEASES_PAGE, mac: RELEASES_PAGE })

  useEffect(() => {
    fetch(LATEST_RELEASE)
      .then(r => (r.ok ? r.json() : null))
      .then((release: { assets?: { name: string; browser_download_url: string }[] } | null) => {
        const find = (end: string) => release?.assets?.find(a => a.name.endsWith(end))?.browser_download_url
        setDownloads({ windows: find('-setup.exe') ?? RELEASES_PAGE, mac: find('.dmg') ?? RELEASES_PAGE })
      })
      .catch(() => {})
  }, [])

  async function signInWithGoogle() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-12 lg:py-16">
        {/* What it is */}
        <div className="text-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="w-14 h-14 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Flashcards</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-3 max-w-xl mx-auto text-pretty">
            Spaced-repetition flashcards, like Anki: FSRS scheduling, rich cards (math, code, images, audio, image occlusion),
            stats, and Anki deck import.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Desktop app: free, for anyone */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Desktop app</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4 text-pretty">
              Free for anyone. No account: your cards stay in a folder on your computer, work offline, and have no size limit.
            </p>
            <div className="space-y-2">
              <a href={downloads.windows} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
                <Monitor size={16} /> Download for Windows
              </a>
              <a href={downloads.mac} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gray-900 dark:bg-gray-700 text-white text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors">
                <Apple size={16} /> Download for Mac
              </a>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-pretty">
              Windows may say “Windows protected your PC”: choose More info → Run anyway. On a Mac, the first time you open it, go to
              System Settings → Privacy &amp; Security and click Open Anyway.
            </p>
          </section>

          {/* Cloud version: private */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 flex flex-col">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Cloud version</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4 text-pretty">
              A private version for me and my friends: your sets sync across devices and work on your phone. If you’ve been invited, sign in.
            </p>
            <div className="flex-1" />
            <button
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.826.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
              </svg>
              {loading ? 'Redirecting…' : 'Sign in with Google'}
            </button>
          </section>
        </div>

        {/* Bringing decks in */}
        <section className="mt-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Download size={16} /> Bring your decks</h2>
          <div className="grid gap-5 sm:grid-cols-2 mt-3 text-sm text-gray-600 dark:text-gray-300">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-100 mb-1.5">From Anki</p>
              <ol className="list-decimal pl-5 space-y-1 marker:text-gray-400 text-pretty">
                <li>In Anki: File → Export, choose <span className="font-medium">Anki Deck Package (.apkg)</span>, and check “Include media”.</li>
                <li>In Flashcards: <span className="font-medium">+ New → Import from Anki</span>, and pick the file.</li>
                <li>Decks become sets (subdecks too); math, code, images and audio come along.</li>
              </ol>
            </div>
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-100 mb-1.5">From a list, or an AI</p>
              <ol className="list-decimal pl-5 space-y-1 marker:text-gray-400 text-pretty">
                <li>Make a set, then open <span className="font-medium">Import</span> on it.</li>
                <li>Paste one card per line: question, a tab, then the answer.</li>
                <li>Or copy the ready-made prompt there into ChatGPT or Claude and paste back what it writes.</li>
              </ol>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
