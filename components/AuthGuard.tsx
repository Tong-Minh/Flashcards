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

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}
