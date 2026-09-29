'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

const UserContext = createContext<User | null>(null)
export const useUser = () => useContext(UserContext)

export default function AuthGuard({ children }: { children: React.ReactNode }) {
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
          if (pathname === '/login') router.replace('/')
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
    router.replace('/login')
    return null
  }

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}
