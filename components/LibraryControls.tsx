'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, FolderOpen, FileUp, RefreshCw, X } from 'lucide-react'
import { useUser } from '@/components/AuthGuard'
import { inTauri } from '@/lib/platform'

const iconButton = 'p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50'

// Web app: downloads all your sets as a zip that the desktop app can import
export function DownloadLibraryButton({ className = iconButton }: { className?: string }) {
  const user = useUser()
  const [busy, setBusy] = useState<string | null>(null)

  async function download() {
    if (!user || busy) return
    setBusy('Preparing…')
    try {
      const { downloadLibraryZip } = await import('@/lib/libraryZip')
      await downloadLibraryZip(user.id, (done, total) => setBusy(`Preparing ${done}/${total}…`))
    } catch {
      alert('Could not download your library. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <button onClick={download} disabled={!!busy} className={className} title={busy ?? 'Download my library (for the desktop app)'}>
      <Download size={17} />
    </button>
  )
}

// When the app last asked GitHub for an update (kept across sidebar remounts, e.g. after studying)
let lastUpdateCheck = 0
const UPDATE_RECHECK_MS = 10 * 60 * 1000

// Desktop app: the open library folder, importing a library zip, switching folders, and app updates
export function DesktopLibraryFooter({ themeButton }: { themeButton: ReactNode }) {
  const fileInput = useRef<HTMLInputElement>(null)
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

  async function importZip(file: File) {
    try {
      const [{ readLibraryZip }, { importLibraryFiles }] = await Promise.all([import('@/lib/libraryZip'), import('@/lib/store/desktop')])
      const { added, skipped } = await importLibraryFiles(await readLibraryZip(file))
      alert(`Imported ${added} set${added !== 1 ? 's' : ''}.${skipped ? ` Skipped ${skipped} that ${skipped === 1 ? 'was' : 'were'} already in this library.` : ''}`)
      window.location.assign('/')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not import that file.')
    }
  }

  async function changeFolder() {
    const { pickLibraryFolder, openLibrary } = await import('@/lib/store/desktop')
    const picked = await pickLibraryFolder()
    if (picked && openLibrary(picked)) window.location.assign('/')
  }

  const folderName = root?.split(/[\\/]/).filter(Boolean).pop() ?? 'Library'

  return (
    <div className="border-t border-gray-200 dark:border-gray-700/70">
      {update && (
        <button
          onClick={() => { setUpdating(true); update.install().catch(() => { setUpdating(false); alert('The update failed. Please try again later.') }) }}
          disabled={updating}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={15} className={updating ? 'animate-spin' : ''} />
          {updating ? 'Updating…' : `Update to ${update.version} and restart`}
        </button>
      )}
      <div className="flex items-center gap-1 px-3 py-3">
        <div className="flex-1 min-w-0 px-1" title={root ?? undefined}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Library</p>
          <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">{folderName}</p>
        </div>
        <button onClick={() => fileInput.current?.click()} className={iconButton} title="Import a library .zip from the web app">
          <FileUp size={17} />
        </button>
        {inTauri() && (
          <button onClick={changeFolder} className={iconButton} title="Open a different library folder">
            <FolderOpen size={17} />
          </button>
        )}
        {themeButton}
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importZip(f) }}
        />
      </div>
    </div>
  )
}

const RELEASES_PAGE  = 'https://github.com/Tong-Minh/Flashcards/releases/latest'
const LATEST_RELEASE = 'https://api.github.com/repos/Tong-Minh/Flashcards/releases/latest'
const PROMO_DISMISSED = 'fc_desktop_promo_dismissed'

// Web app on Windows and Mac: offers the desktop app. On Windows it links straight to the newest
// installer (falling back to the releases page); Macs don't have a build yet, so they see "coming
// soon". Stays hidden once dismissed.
export function DesktopAppPromo() {
  const [platform, setPlatform] = useState<'windows' | 'mac' | null>(null)
  const [href,     setHref]     = useState(RELEASES_PAGE)

  useEffect(() => {
    let dismissed = false
    try { dismissed = localStorage.getItem(PROMO_DISMISSED) === '1' } catch {}
    const ua = navigator.userAgent
    const found = /Windows/i.test(ua) ? 'windows' : /Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua) ? 'mac' : null
    if (dismissed || !found) return
    setPlatform(found)
    if (found !== 'windows') return
    fetch(LATEST_RELEASE)
      .then(r => (r.ok ? r.json() : null))
      .then((release: { assets?: { name: string; browser_download_url: string }[] } | null) => {
        const exe = release?.assets?.find(a => a.name.endsWith('-setup.exe'))
        if (exe) setHref(exe.browser_download_url)
      })
      .catch(() => {})
  }, [])

  if (!platform) return null
  return (
    <div className="relative mx-3 mb-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-900/20 p-3">
      <button
        onClick={() => { try { localStorage.setItem(PROMO_DISMISSED, '1') } catch {}; setPlatform(null) }}
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
      {platform === 'windows' ? (
        <a
          href={href}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
        >
          <Download size={14} /> Download for Windows
        </a>
      ) : (
        <button
          disabled
          className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-indigo-600/40 dark:bg-indigo-500/30 text-white text-xs font-semibold cursor-not-allowed"
        >
          Mac version coming soon
        </button>
      )}
    </div>
  )
}
