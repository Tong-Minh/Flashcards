'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { useUser } from '@/components/AuthGuard'
import { store } from '@/lib/store'
import { IS_DESKTOP } from '@/lib/platform'
import type { SetWithStats } from '@/lib/store/types'
import type { Collection } from '@/lib/types'

// Packs all or some sets into a library zip, to open in the other app (web ⇄ desktop, Windows ⇄ Mac)
export default function ExportLibrary() {
  const user = useUser()
  const [sets,        setSets]        = useState<SetWithStats[] | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [chosen,      setChosen]      = useState<Set<string>>(new Set())
  const [busy,        setBusy]        = useState<string | null>(null)
  const [done,        setDone]        = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (!user) return
    store.loadLibrary(user.id).then(lib => {
      setSets(lib.sets)
      setCollections(lib.collections)
      setChosen(new Set(lib.sets.map(s => s.id)))
    }).catch(() => setError('Could not load your sets.'))
  }, [user])

  // Sets grouped under their collection, loose sets last
  const groups = useMemo(() => {
    if (!sets) return []
    const out = collections.map(c => ({ collection: c as Collection | null, sets: sets.filter(s => s.collection_id === c.id) })).filter(g => g.sets.length)
    const loose = sets.filter(s => !s.collection_id || !collections.some(c => c.id === s.collection_id))
    if (loose.length) out.push({ collection: null, sets: loose })
    return out
  }, [sets, collections])

  const toggle = (ids: string[], on: boolean) => setChosen(prev => {
    const next = new Set(prev)
    for (const id of ids) on ? next.add(id) : next.delete(id)
    return next
  })

  async function exportZip() {
    if (!user || !sets) return
    setBusy('Packing…')
    setError('')
    setDone(false)
    try {
      const all = chosen.size === sets.length
      const ids = all ? undefined : [...chosen]
      const { zipLibrary, deliverZip, zipName } = await import('@/lib/libraryTransfer')
      const bundle = IS_DESKTOP
        ? await (await import('@/lib/store/desktop')).exportBundle(ids)
        : await (await import('@/lib/webLibrary')).exportWebBundle(user.id, ids, (n, total) => setBusy(`Packing ${n}/${total}…`))
      setBusy('Zipping…')
      if (await deliverZip(await zipLibrary(bundle), zipName())) setDone(true)
    } catch (err) {
      setError(err instanceof Error ? `Could not export: ${err.message}` : 'Could not export your library.')
    } finally {
      setBusy(null)
    }
  }

  const cardCount = sets?.filter(s => chosen.has(s.id)).reduce((n, s) => n + s.totalCards, 0) ?? 0

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors" aria-label="Back">←</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Export a library</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 text-sm text-gray-600 dark:text-gray-300 space-y-3 mb-5">
        <p className="text-pretty">
          This packs the sets you choose into one <span className="font-semibold text-gray-800 dark:text-gray-100">library zip</span>: their cards and collections,
          your progress, your review history and stats, and your study settings{IS_DESKTOP ? ', plus the images in your cards' : ''}.
        </p>
        <p className="font-semibold text-gray-800 dark:text-gray-100">Use it to:</p>
        <ul className="list-disc pl-5 space-y-1 marker:text-gray-300 dark:marker:text-gray-600">
          {IS_DESKTOP ? <>
            <li>move sets to the desktop app on another computer, Windows or Mac</li>
            <li>bring them into the web app, so you can study on your phone (images stay behind; the web app shows a placeholder)</li>
            <li>keep a backup</li>
          </> : <>
            <li>move your sets into the desktop app</li>
            <li>keep a backup</li>
          </>}
        </ul>
        <p className="text-pretty">Open the zip with <span className="font-semibold text-gray-800 dark:text-gray-100">Import a library</span> in the other app. Importing only adds what’s missing, so you can import the same zip again safely.</p>
      </div>

      {!sets ? (
        <p className="text-center text-gray-400 dark:text-gray-500 py-10">{error || 'Loading your sets…'}</p>
      ) : sets.length === 0 ? (
        <p className="text-center text-gray-400 dark:text-gray-500 py-10">You don’t have any sets yet.</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{chosen.size} of {sets.length} sets · {cardCount.toLocaleString()} cards</p>
            <button
              onClick={() => toggle(sets.map(s => s.id), chosen.size !== sets.length)}
              className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {chosen.size === sets.length ? 'Select none' : 'Select all'}
            </button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm divide-y divide-gray-100 dark:divide-gray-700 mb-5">
            {groups.map(g => {
              const ids = g.sets.map(s => s.id)
              const all = ids.every(id => chosen.has(id))
              return (
                <div key={g.collection?.id ?? 'loose'} className="py-2">
                  <label className="flex items-center gap-3 px-4 py-1.5 cursor-pointer">
                    <input type="checkbox" checked={all} onChange={e => toggle(ids, e.target.checked)} className="w-4 h-4 rounded text-indigo-600" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{g.collection?.name ?? 'Not in a collection'}</span>
                  </label>
                  {g.sets.map(s => (
                    <label key={s.id} className="flex items-center gap-3 pl-11 pr-4 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <input type="checkbox" checked={chosen.has(s.id)} onChange={e => toggle([s.id], e.target.checked)} className="w-4 h-4 rounded text-indigo-600" />
                      <span className="flex-1 min-w-0 truncate text-sm text-gray-800 dark:text-gray-100">{s.name}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{s.totalCards}</span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>

          <button
            onClick={exportZip}
            disabled={!!busy || chosen.size === 0}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-2xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Download size={18} /> {busy ?? `Export ${chosen.size} set${chosen.size !== 1 ? 's' : ''}`}
          </button>
          {error && <p className="text-sm text-red-600 dark:text-red-400 text-center mt-3">{error}</p>}
          {done && <p className="text-sm text-green-700 dark:text-green-400 text-center mt-3">Saved. Open it with Import a library in the other app.</p>}
        </>
      )}
    </div>
  )
}
