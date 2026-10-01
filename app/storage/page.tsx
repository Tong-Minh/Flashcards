'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { useUser } from '@/components/AuthGuard'
import { ItemIcon } from '@/components/ItemIcon'
import { store } from '@/lib/store'
import { paths } from '@/lib/paths'
import { formatBytes } from '@/lib/media'
import { IS_DESKTOP, inTauri } from '@/lib/platform'
import type { SetWithStats, StorageReport } from '@/lib/store/types'
import type { Collection } from '@/lib/types'

// How much space each collection and set takes, and (desktop) the app as a whole
export default function Storage() {
  const user = useUser()
  const [sets,        setSets]        = useState<SetWithStats[] | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [report,      setReport]      = useState<StorageReport | null>(null)
  const [app,         setApp]         = useState<{ install: number; data: number } | null>(null)
  const [open,        setOpen]        = useState<Set<string>>(new Set())
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (!user) return
    store.loadLibrary(user.id).then(async lib => {
      setSets(lib.sets)
      setCollections(lib.collections)
      setReport(await store.getStorage(lib.sets.map(s => s.id)))
    }).catch(() => setError('Could not measure your library.'))
    if (inTauri()) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke<{ install: number; data: number }>('app_storage'))
        .then(setApp)
        .catch(() => {})
    }
  }, [user])

  const sizeOf = useMemo(() => new Map((report?.sets ?? []).map(s => [s.id, s.data + s.media])), [report])
  const groups = useMemo(() => {
    if (!sets || !report) return []
    const bySize = (a: SetWithStats, b: SetWithStats) => (sizeOf.get(b.id) ?? 0) - (sizeOf.get(a.id) ?? 0)
    const out = collections.map(c => {
      const inside = sets.filter(s => s.collection_id === c.id).sort(bySize)
      return { key: c.id, collection: c as Collection | null, sets: inside, total: inside.reduce((n, s) => n + (sizeOf.get(s.id) ?? 0), 0) }
    })
    const loose = sets.filter(s => !s.collection_id || !collections.some(c => c.id === s.collection_id)).sort(bySize)
    if (loose.length) out.push({ key: 'loose', collection: null, sets: loose, total: loose.reduce((n, s) => n + (sizeOf.get(s.id) ?? 0), 0) })
    return out.sort((a, b) => b.total - a.total)
  }, [sets, collections, report, sizeOf])

  const data = report?.sets.reduce((n, s) => n + s.data, 0) ?? 0
  const media = report?.mediaTotal ?? 0
  const largest = Math.max(1, ...groups.map(g => g.total))
  const toggle = (key: string) => setOpen(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })

  return (
    <div className="max-w-lg lg:max-w-3xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors" aria-label="Back">←</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Storage</h1>
      </div>

      {error ? (
        <p className="text-center text-sm text-red-600 dark:text-red-400 py-16">{error}</p>
      ) : !report || !sets ? (
        <p className="text-center text-gray-400 dark:text-gray-500 py-16">Measuring…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Cards and progress', value: data },
              ...(IS_DESKTOP ? [{ label: 'Images and audio', value: media }] : []),
              ...(app ? [{ label: 'The app', value: app.install }, { label: 'App data', value: app.data }] : []),
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-3 text-center">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatBytes(s.value)}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {IS_DESKTOP
              ? <>Total: <span className="font-semibold text-gray-900 dark:text-gray-100">{formatBytes(data + media + (app ? app.install + app.data : 0))}</span>{app ? '' : ' (plus the app itself, shown in the installed app)'}. Your library is {formatBytes(data + media)} of that.</>
              : <>Your sets take about <span className="font-semibold text-gray-900 dark:text-gray-100">{formatBytes(data)}</span> in the cloud (cards, progress and review history). Images and audio are only stored by the desktop app.</>}
          </p>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm divide-y divide-gray-100 dark:divide-gray-700">
            {groups.map(g => (
              <div key={g.key}>
                <button onClick={() => toggle(g.key)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                  {g.collection
                    ? <ItemIcon icon={g.collection.icon} color={g.collection.color} kind="collection" size="xs" />
                    : <span className="w-6" />}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{g.collection?.name ?? 'My Sets (not in a collection)'}</span>
                    <span className="block h-1.5 mt-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <span className="block h-full bg-indigo-500 rounded-full" style={{ width: `${(g.total / largest) * 100}%` }} />
                    </span>
                  </span>
                  <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200">{formatBytes(g.total)}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 w-14 text-right">{g.sets.length} set{g.sets.length !== 1 ? 's' : ''}</span>
                  <ChevronDown size={16} className={`text-gray-400 transition-transform ${open.has(g.key) ? 'rotate-180' : ''}`} />
                </button>
                {open.has(g.key) && (
                  <div className="pb-2">
                    {g.sets.map(s => {
                      const r = report.sets.find(x => x.id === s.id)
                      return (
                        <Link key={s.id} href={paths.set(s.id)} className="flex items-center gap-3 pl-14 pr-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                          <span className="flex-1 min-w-0 truncate text-sm text-gray-700 dark:text-gray-200">{s.name}</span>
                          {IS_DESKTOP && r && r.media > 0 && <span className="text-xs text-gray-400 dark:text-gray-500">{formatBytes(r.media)} media</span>}
                          <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300 w-16 text-right">{formatBytes(sizeOf.get(s.id) ?? 0)}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
            {groups.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">No sets yet</p>}
          </div>
          {IS_DESKTOP && <p className="text-xs text-gray-400 dark:text-gray-500 text-pretty">An image used by several sets counts toward each of them, but only once in the totals above.</p>}
        </div>
      )}
    </div>
  )
}
