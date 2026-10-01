'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { IS_DESKTOP } from '@/lib/platform'
import { libraryNeedingAccess, openLibrary, pickLibraryFolder } from '@/lib/store/desktop'
import { LOCAL_USER_ID } from '@/lib/store/localStore'

const UserContext = createContext<User | null>(null)

// Where to go after logging in, so a shared link opened while logged out lands on the shared page
const RETURN_KEY = 'fc_return_to'
export const useUser = () => useContext(UserContext)

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  // The desktop app has no accounts: everything in the library folder is yours
  if (IS_DESKTOP) return <LibraryGate>{children}</LibraryGate>
  return <WebAuthGuard>{children}</WebAuthGuard>
}

// Stands in for the signed-in user on desktop, so ownership checks (set.user_id === user.id) pass
const LOCAL_USER = { id: LOCAL_USER_ID, email: '', user_metadata: { full_name: 'My library' } } as unknown as User

// Opens the remembered library folder, or asks for one on first launch
function LibraryGate({ children }: { children: React.ReactNode }) {
  const [ready,   setReady]   = useState(false)
  const [checked, setChecked] = useState(false)
  const [again,   setAgain]   = useState<string | null>(null)

  useEffect(() => {
    setReady(openLibrary())
    setAgain(libraryNeedingAccess())
    setChecked(true)
  }, [])

  async function choose() {
    const root = await pickLibraryFolder()
    if (root && openLibrary(root)) setReady(true)
  }

  if (!checked) return null
  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="w-16 h-16 mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{again ? 'Choose your library again' : 'Welcome to Flashcards'}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 mb-6 text-pretty">
            {again ? (
              <>This update needs access to your library&apos;s subfolders. Choose the same folder again: <span className="font-medium text-gray-700 dark:text-gray-300 break-all">{again}</span></>
            ) : (
              <>Choose a folder to keep your cards in. Pick an empty folder to start a new library, or a folder that already has one.</>
            )}
          </p>
          <button
            onClick={choose}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            Choose folder
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            Tip: a folder inside OneDrive or Dropbox gets backed up automatically.
          </p>
        </div>
      </div>
    )
  }
  return <UserContext.Provider value={LOCAL_USER}>{children}</UserContext.Provider>
}

function WebAuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const claimed = useRef(false)

  useEffect(() => {
    // onAuthStateChange fires for INITIAL_SESSION (no stored session),
    // SIGNED_IN (OAuth callback processes the hash/code), and SIGNED_OUT.
    // Relying on it alone avoids the race where getSession() returns null
    // while the hash token is still being exchanged.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)

        if (event === 'SIGNED_IN' && currentUser && !claimed.current) {
          claimed.current = true
          await supabase.rpc('claim_unclaimed_sets')
          let returnTo: string | null = null
          try { returnTo = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY) } catch {}
          if (returnTo) router.replace(returnTo)
          else if (pathname === '/login') router.replace('/')
        }

        if (event === 'SIGNED_OUT') {
          claimed.current = false
          router.replace('/login')
        }

        setLoading(false)
      }
    )

    // Safety fallback: if onAuthStateChange never fires (e.g. network issue),
    // stop showing the loading screen after 4s.
    const fallback = setTimeout(() => setLoading(false), 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(fallback)
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (!user && pathname !== '/login') {
    try { if (pathname !== '/') sessionStorage.setItem(RETURN_KEY, pathname) } catch {}
    router.replace('/login')
    return null
  }

  if (user && pathname !== '/login') return <MembershipGate user={user}>{children}</MembershipGate>
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

// The invite password typed on the front page, used once the Google sign-in comes back
export const INVITE_KEY = 'fc_invite'
const memberKey = (id: string) => `fc_member_${id}`

// The cloud version is invite-only: an account has to join with the invite password once (checked by
// the database's join_with_invite, which also enforces it: only members can create sets). Members are
// remembered on the device so the app opens instantly and offline.
function MembershipGate({ user, children }: { user: User; children: React.ReactNode }) {
  const [state,    setState]    = useState<'checking' | 'member' | 'join'>(() => {
    try { return localStorage.getItem(memberKey(user.id)) === '1' ? 'member' : 'checking' } catch { return 'checking' }
  })
  const [password, setPassword] = useState('')
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')

  const welcome = () => {
    try { localStorage.setItem(memberKey(user.id), '1') } catch {}
    setState('member')
  }

  async function join(pw: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('join_with_invite', { invite_password: pw })
    if (error) { setError(error.message.includes('Too many') ? error.message : 'Could not check the password. Try again.'); return false }
    if (data === true) { welcome(); return true }
    setError('That’s not the invite password.')
    return false
  }

  useEffect(() => {
    if (state === 'member') return
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('profiles').select('member').eq('id', user.id).maybeSingle()
      if (!alive) return
      // Couldn't check (offline, or the database not set up for it): let the app open; the database
      // still refuses non-members
      if (error) { setState('member'); return }
      if (data?.member) { welcome(); return }
      // Typed on the front page before signing in with Google
      let pending: string | null = null
      try { pending = sessionStorage.getItem(INVITE_KEY); sessionStorage.removeItem(INVITE_KEY) } catch {}
      if (pending && await join(pending)) return
      if (alive) setState('join')
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  if (state === 'member') return <UserContext.Provider value={user}>{children}</UserContext.Provider>
  if (state === 'checking') {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
  }
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <form
        onSubmit={async e => { e.preventDefault(); if (!password.trim()) return; setBusy(true); setError(''); await join(password.trim()); setBusy(false) }}
        className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 text-center"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="w-12 h-12 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Invite only</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4 text-pretty">
          The cloud version is for friends. Enter the invite password to join, or get the free desktop app instead.
        </p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Invite password"
          autoFocus
          className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
        <button type="submit" disabled={busy || !password.trim()} className="mt-3 w-full bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
          {busy ? 'Checking…' : 'Join'}
        </button>
        <div className="flex justify-between mt-4 text-xs">
          <a href="/login" onClick={e => { e.preventDefault(); supabase.auth.signOut() }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Sign out</a>
          <a href="/login" onClick={e => { e.preventDefault(); supabase.auth.signOut() }} className="text-indigo-600 dark:text-indigo-400 hover:underline">Get the desktop app</a>
        </div>
      </form>
    </div>
  )
}
