'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, FolderOpen, FileUp, RefreshCw } from 'lucide-react'
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

// Desktop app: the open library folder, importing a library zip, switching folders, and app updates
export function DesktopLibraryFooter({ themeButton }: { themeButton: ReactNode }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [root,   setRoot]   = useState<string | null>(null)
  const [update, setUpdate] = useState<{ version: string; install: () => Promise<void> } | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    import('@/lib/store/desktop').then(m => setRoot(m.libraryRoot()))
    if (!inTauri()) return
    // Checks the GitHub release for a newer version
    ;(async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const found = await check()
        if (!found) return
        setUpdate({
          version: found.version,
          install: async () => {
            await found.downloadAndInstall()
            const { relaunch } = await import('@tauri-apps/plugin-process')
            await relaunch()
          },
        })
      } catch {}
    })()
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
