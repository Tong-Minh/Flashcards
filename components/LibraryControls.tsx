'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Download, FolderOpen, FileUp, RefreshCw, X } from 'lucide-react'
import { inTauri } from '@/lib/platform'
import { notify } from '@/lib/dialogs'

const iconButton = 'p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50'

// Export and import a library zip (lib/libraryTransfer.ts). Each opens a page that explains it.
export function LibraryTransferLinks({ className = iconButton }: { className?: string }) {
  return <>
    <Link href="/library/export" className={className} title="Export a library (.zip)" aria-label="Export a library">
      <Download size={17} />
    </Link>
    <Link href="/library/import" className={className} title="Import a library (.zip)" aria-label="Import a library">
      <FileUp size={17} />
    </Link>
  </>
}

// When the app last asked GitHub for an update (kept across sidebar remounts, e.g. after studying)
let lastUpdateCheck = 0
const UPDATE_RECHECK_MS = 10 * 60 * 1000

// Desktop app: the open library folder, importing a library zip, switching folders, and app updates
export function DesktopLibraryFooter({ themeButton }: { themeButton: ReactNode }) {
  const [root,   setRoot]   = useState<string | null>(null)
  const [update, setUpdate] = useState<{ version: string; install: () => Promise<void> } | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    import('@/lib/store/desktop').then(m => setRoot(m.libraryRoot()))
    if (!inTauri()) return
    // Checks the latest GitHub release for a newer version: on launch, every hour while the app is
    // open, and when the window regains focus (at most every 10 minutes). Offline, it quietly fails.
    let cancelled = false
    const checkNow = async () => {
      if (Date.now() - lastUpdateCheck < UPDATE_RECHECK_MS) return
      lastUpdateCheck = Date.now()
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const found = await check()
        if (!found || cancelled) return
        setUpdate({
          version: found.version,
          install: async () => {
            await found.downloadAndInstall()
            const { relaunch } = await import('@tauri-apps/plugin-process')
            await relaunch()
          },
        })
      } catch {}
    }
    checkNow()
    const timer = setInterval(checkNow, 60 * 60 * 1000)
    window.addEventListener('focus', checkNow)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', checkNow)
    }
  }, [])

  const folderName = root?.split(/[\\/]/).filter(Boolean).pop() ?? 'Library'

  return (
    <div className="border-t border-gray-200 dark:border-gray-700/70">
      {update && (
        <button
          onClick={() => { setUpdating(true); update.install().catch(() => { setUpdating(false); notify('The update failed. Please try again later.') }) }}
          disabled={updating}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={15} className={updating ? 'animate-spin' : ''} />
          {updating ? 'Updating…' : `Update to ${update.version} and restart`}
        </button>
      )}
      <div className="flex items-center gap-1 px-3 py-3">
        {/* Each opens a page that explains it before doing anything */}
        <Link href="/library/folder" className="flex-1 min-w-0 px-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors" title={root ?? undefined}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Library</p>
          <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">{folderName}</p>
        </Link>
        <LibraryTransferLinks />
        <Link href="/library/folder" className={iconButton} title="Open a different library folder">
          <FolderOpen size={17} />
        </Link>
        {themeButton}
      </div>
    </div>
  )
}

const RELEASES_PAGE  = 'https://github.com/Tong-Minh/Flashcards/releases/latest'
const LATEST_RELEASE = 'https://api.github.com/repos/Tong-Minh/Flashcards/releases/latest'
// Macs have their own key: Mac visitors who dismissed the old "coming soon" card see it again
const PROMO_DISMISSED = { windows: 'fc_desktop_promo_dismissed', mac: 'fc_desktop_promo_dismissed_mac' }
const INSTALLER = { windows: '-setup.exe', mac: '.dmg' }

// Web app on Windows and Mac: offers the desktop app, linking straight to the newest installer for
// that system (falling back to the releases page). Stays hidden once dismissed.
export function DesktopAppPromo() {
  const [platform, setPlatform] = useState<'windows' | 'mac' | null>(null)
  const [href,     setHref]     = useState(RELEASES_PAGE)

  useEffect(() => {
    const ua = navigator.userAgent
    const found = /Windows/i.test(ua) ? 'windows' : /Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua) ? 'mac' : null
    if (!found) return
    let dismissed = false
    try { dismissed = localStorage.getItem(PROMO_DISMISSED[found]) === '1' } catch {}
    if (dismissed) return
    setPlatform(found)
    fetch(LATEST_RELEASE)
      .then(r => (r.ok ? r.json() : null))
      .then((release: { assets?: { name: string; browser_download_url: string }[] } | null) => {
        const file = release?.assets?.find(a => a.name.endsWith(INSTALLER[found]))
        if (file) setHref(file.browser_download_url)
      })
      .catch(() => {})
  }, [])

  if (!platform) return null
  return (
    <div className="relative mx-3 mb-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-900/20 p-3">
      <button
        onClick={() => { try { localStorage.setItem(PROMO_DISMISSED[platform], '1') } catch {}; setPlatform(null) }}
        className="absolute top-1.5 right-1.5 p-1 rounded-md text-indigo-300 hover:text-indigo-600 dark:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X size={14} />
      </button>
      <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200 pr-4">Get the desktop app</p>
      <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 mt-0.5 mb-2.5 text-pretty">
        Study offline with your cards saved in a folder on your {platform === 'mac' ? 'Mac' : 'PC'}. No size limits.
      </p>
      <a
        href={href}
        className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
      >
        <Download size={14} /> Download for {platform === 'mac' ? 'Mac' : 'Windows'}
      </a>
      {platform === 'mac' && (
        <p className="text-[11px] text-indigo-700/70 dark:text-indigo-300/70 mt-2 text-pretty">
          The first time you open it, macOS blocks it. Go to System Settings → Privacy &amp; Security and click Open Anyway.
        </p>
      )}
    </div>
  )
}
