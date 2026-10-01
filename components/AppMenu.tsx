'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Download, FileUp, FolderOpen, HardDrive, LogOut, Moon, MoreHorizontal, SlidersHorizontal, Sun, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useDarkMode } from '@/components/ThemeProvider'
import { IS_DESKTOP } from '@/lib/platform'

// The ⋯ menu that holds everything besides the main actions: study settings, moving the library,
// the library folder and uninstalling (desktop), the theme, and signing out (web). In the phone
// header (opens down) and the sidebar footer (opens up).
export function AppMenu({ up, className = '' }: { up?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const { theme, toggle } = useDarkMode()
  const close = () => setOpen(false)

  const item = 'flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors'
  const link = (href: string, icon: ReactNode, label: string) => (
    <Link href={href} onClick={close} className={item}>{icon}{label}</Link>
  )

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="More"
        title="More"
        className={`p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-800 dark:hover:text-gray-100 transition-colors ${className}`}
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className={`absolute right-0 z-40 w-60 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 overflow-hidden ${up ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
            {link('/settings', <SlidersHorizontal size={16} />, 'Study settings')}
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            {link('/library/export', <Download size={16} />, 'Export library')}
            {link('/library/import', <FileUp size={16} />, 'Import library')}
            {IS_DESKTOP && link('/library/folder', <FolderOpen size={16} />, 'Library folder')}
            {link('/storage', <HardDrive size={16} />, 'Storage')}
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <button onClick={() => { toggle(); close() }} className={item}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            {IS_DESKTOP
              ? link('/uninstall', <Trash2 size={16} />, 'Uninstall Flashcards…')
              : (
                <button onClick={() => { close(); supabase.auth.signOut() }} className={item}>
                  <LogOut size={16} /> Sign out
                </button>
              )}
          </div>
        </>
      )}
    </div>
  )
}
