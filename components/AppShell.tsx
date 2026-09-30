'use client'

import { Suspense, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Compass, Library, LogOut, Moon, Plus, Sun, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useUser } from '@/components/AuthGuard'
import { useDarkMode } from '@/components/ThemeProvider'
import { ItemIcon } from '@/components/ItemIcon'
import { getCachedCollections, COLLECTIONS_EVENT } from '@/lib/storage'
import type { Collection } from '@/lib/types'

// Pages that get the whole screen: signing in, and studying (focus mode)
function isBare(pathname: string) {
  return pathname === '/login' || /^\/sets\/[^/]+\/study/.test(pathname)
}

// Desktop (lg and up) gets a fixed sidebar with navigation and the user's collections; phones keep the
// single-column layout with the home page's tab bar. `data-sidebar` lets fixed bottom bars (the
// `.fixed-bar` class) start to the right of the sidebar.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (isBare(pathname)) return <>{children}</>
  return (
    <div data-sidebar>
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <div className="lg:pl-64">{children}</div>
    </div>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const params   = useSearchParams()
  const user     = useUser()
  const { theme, toggle } = useDarkMode()
  const [collections, setCollections] = useState<Collection[]>([])

  useEffect(() => {
    const load = () => setCollections(getCachedCollections().filter(c => !user || c.user_id === user.id))
    load()
    window.addEventListener(COLLECTIONS_EVENT, load)
    window.addEventListener('storage', load)
    return () => {
      window.removeEventListener(COLLECTIONS_EVENT, load)
      window.removeEventListener('storage', load)
    }
  }, [user])

  const tab = pathname === '/' ? params.get('tab') ?? 'mine' : null
  const name   = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? ''
  const avatar = user?.user_metadata?.avatar_url as string | undefined

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col bg-white dark:bg-gray-800/60 border-r border-gray-200 dark:border-gray-800">
      <Link href="/" className="flex items-center gap-2.5 px-5 h-16 flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="w-7 h-7" />
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">Flashcards</span>
      </Link>

      <div className="px-3">
        <Link
          href="/sets/new"
          className="flex items-center justify-center gap-1.5 w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} /> New set
        </Link>
      </div>

      <nav className="px-3 mt-4 space-y-0.5">
        <NavItem href="/"               active={tab === 'mine'}     icon={<Library size={18} />}>My Sets</NavItem>
        <NavItem href="/?tab=discover"  active={tab === 'discover'} icon={<Compass size={18} />}>Discover</NavItem>
        <NavItem href="/?tab=friends"   active={tab === 'friends'}  icon={<Users size={18} />}>Friends</NavItem>
      </nav>

      <div className="flex items-center justify-between px-5 mt-6 mb-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Collections</p>
        <Link
          href="/collections/new"
          className="p-1 -mr-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="New collection"
          aria-label="New collection"
        >
          <Plus size={16} />
        </Link>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-0.5">
        {collections.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-gray-400 dark:text-gray-500">No collections yet</p>
        ) : collections.map(c => {
          const active = pathname === `/collections/${c.id}`
          return (
            <Link
              key={c.id}
              href={`/collections/${c.id}`}
              className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60'
              }`}
            >
              <ItemIcon icon={c.icon} color={c.color} kind="collection" size="xs" />
              <span className="truncate">{c.name}</span>
            </Link>
          )
        })}
      </div>

      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-200 dark:border-gray-700/70">
        {avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
          : <div className="w-8 h-8 rounded-full flex-shrink-0 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm font-semibold">{name.charAt(0).toUpperCase()}</div>}
        <p className="flex-1 min-w-0 truncate text-sm font-medium text-gray-700 dark:text-gray-200">{name}</p>
        <button
          onClick={toggle}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Sign out"
        >
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  )
}

function NavItem({ href, active, icon, children }: { href: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60'
      }`}
    >
      {icon}
      {children}
    </Link>
  )
}
