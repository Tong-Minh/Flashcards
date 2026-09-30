'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileUp } from 'lucide-react'
import { useUser } from '@/components/AuthGuard'
import { ContentRenderer } from '@/components/ContentRenderer'
import { IS_DESKTOP } from '@/lib/platform'
import { store } from '@/lib/store'
import { cacheCollections, cacheSets } from '@/lib/storage'
import { suggestIcon } from '@/lib/icons'
import { prepareImage } from '@/lib/images'
import { TYPE_LABELS } from '@/lib/cardTypes'
import { groupDecks, MEDIA_PREFIX, type ImportPlan } from '@/lib/anki/convert'
import type { CardDraft } from '@/lib/types'

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }

// Imports an Anki deck (.apkg) or an Anki text export (.txt) as new sets. Everything starts as new
// (no Anki scheduling is carried over). Images come along in the desktop app only.
export default function ImportAnki() {
  const router = useRouter()
  const user   = useUser()
  const input  = useRef<HTMLInputElement>(null)
  const [plan,     setPlan]     = useState<ImportPlan | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading,  setReading]  = useState(false)
  const [error,    setError]    = useState('')
  const [depth,    setDepth]    = useState(99)
  const [skipped,  setSkipped]  = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const maxDepth = plan ? Math.max(1, ...plan.decks.map(d => d.path.length)) : 1
  const groups   = useMemo(() => (plan ? groupDecks(plan.decks, Math.min(depth, maxDepth)) : []), [plan, depth, maxDepth])
  const chosen   = groups.filter(g => !skipped.has(g.key))
  const cardCount = chosen.reduce((n, g) => n + g.cards.length, 0)
  const samples  = (groups.find(g => !skipped.has(g.key))?.cards ?? []).slice(0, 3)

  async function read(file: File) {
    setError('')
    setPlan(null)
    setReading(true)
    setFileName(file.name)
    try {
      let next: ImportPlan
      if (/\.(txt|tsv|csv)$/i.test(file.name)) {
        const { planTextImport } = await import('@/lib/anki/txt')
        next = planTextImport(await file.text(), file.name)
      } else {
        const [{ readApkg }, { planImport }] = await Promise.all([import('@/lib/anki/apkg'), import('@/lib/anki/convert')])
        next = planImport(await readApkg(file), { images: IS_DESKTOP })
      }
      if (next.report.cards === 0) throw new Error('No cards found in that file.')
      setPlan(next)
      setSkipped(new Set())
      setDepth(99)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setReading(false)
    }
  }

  async function runImport() {
    if (!plan || !user) return
    setError('')
    try {
      // Reuse collections that already exist with the same name
      const collections = await store.listCollections(user.id)
      const byName = new Map(collections.map(c => [c.name.toLowerCase(), c.id]))
      const saved = new Map<number, string>()   // media index → saved image path

      async function withImages(text: string): Promise<string> {
        const refs = [...new Set([...text.matchAll(new RegExp(`${MEDIA_PREFIX}(\\d+)`, 'g'))].map(m => Number(m[1])))]
        for (const i of refs) {
          if (saved.has(i)) continue
          const name = plan!.mediaNames[i]
          const load = plan!.media.get(name)
          if (!load) continue
          const ext = name.split('.').pop()?.toLowerCase() ?? ''
          const { bytes, ext: outExt } = await prepareImage(new Blob([await load() as BlobPart], { type: IMAGE_TYPES[ext] ?? '' }), name)
          saved.set(i, await store.saveImage(bytes, outExt))
        }
        return text.replace(new RegExp(`${MEDIA_PREFIX}(\\d+)`, 'g'), (m, i) => saved.get(Number(i)) ?? m)
      }
      const resolve = async (c: CardDraft): Promise<CardDraft> => ({
        ...c,
        question: await withImages(c.question),
        answer: await withImages(c.answer),
      })

      for (let g = 0; g < chosen.length; g++) {
        const group = chosen[g]
        setProgress(`Importing ${g + 1} of ${chosen.length}: ${group.name}`)
        let collectionId: string | null = null
        if (group.collection) {
          collectionId = byName.get(group.collection.toLowerCase()) ?? null
          if (!collectionId) {
            const created = await store.createCollection({ name: group.collection, icon: suggestIcon(group.collection) })
            byName.set(group.collection.toLowerCase(), created.id)
            collectionId = created.id
          }
        }
        // Sets have a size cap on the web; split bigger decks into parts
        const size = store.maxCardsPerSet
        const parts = Math.ceil(group.cards.length / size)
        for (let p = 0; p < parts; p++) {
          const set = await store.createSet({
            name: parts > 1 ? `${group.name} (${p + 1})` : group.name,
            description: 'Imported from Anki',
            is_public: false,
            tags: group.tags,
            collection_id: collectionId,
            icon: suggestIcon(group.name) ?? (group.collection ? suggestIcon(group.collection) : null),
            color: null,
          })
          const cards: CardDraft[] = []
          for (const c of group.cards.slice(p * size, (p + 1) * size)) cards.push(await resolve(c))
          await store.addCards(set.id, cards)
        }
      }
      // The home page refreshes from the store
      cacheSets([])
      cacheCollections([])
      router.push('/')
    } catch (e) {
      setError(`The import stopped partway: ${e instanceof Error ? e.message : 'unknown error'}. Sets created so far were kept.`)
      setProgress(null)
    }
  }

  const r = plan?.report
  const notes: string[] = []
  if (r) {
    const imageCount = plan!.mediaNames.length
    if (imageCount) notes.push(`${imageCount} image${imageCount !== 1 ? 's' : ''} included`)
    if (r.imagesDropped) notes.push(IS_DESKTOP ? `${r.imagesDropped} image${r.imagesDropped !== 1 ? 's' : ''} left out (web links or missing)` : `${r.imagesDropped} image${r.imagesDropped !== 1 ? 's' : ''} left out (images need the desktop app)`)
    if (r.audio) notes.push(`${r.audio} audio clip${r.audio !== 1 ? 's' : ''} left out`)
    if (r.tables) notes.push(`${r.tables} table${r.tables !== 1 ? 's' : ''} turned into text lines`)
    for (const [why, n] of Object.entries(r.unsupported)) notes.push(`${n} ${why} card${n !== 1 ? 's' : ''} skipped (not supported)`)
    if (r.skippedEmpty) notes.push(`${r.skippedEmpty} empty card${r.skippedEmpty !== 1 ? 's' : ''} skipped`)
  }

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors">←</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import from Anki</h1>
      </div>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) read(f) }}
        disabled={reading || !!progress}
        className={`w-full rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragOver ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800'
        }`}
      >
        <FileUp className="mx-auto mb-2 text-indigo-500" size={28} />
        <p className="font-semibold text-gray-900 dark:text-gray-100">{reading ? 'Reading…' : fileName || 'Choose an Anki file'}</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          A deck package (.apkg) or a text export (.txt). Drop it here or click to browse.
        </p>
      </button>
      <input
        ref={input}
        type="file"
        accept=".apkg,.colpkg,.txt,.tsv,.csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) read(f) }}
      />

      {error && (
        <p className="mt-4 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">{error}</p>
      )}

      {plan && r && (
        <div className="mt-6 space-y-5">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
            <p className="font-semibold text-gray-900 dark:text-gray-100">
              {cardCount.toLocaleString()} card{cardCount !== 1 ? 's' : ''} in {chosen.length} set{chosen.length !== 1 ? 's' : ''}
            </p>
            <ul className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 space-y-0.5">
              <li>All cards start as new.</li>
              {notes.map(n => <li key={n}>{n.charAt(0).toUpperCase() + n.slice(1)}.</li>)}
            </ul>
          </div>

          {maxDepth > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Make a set for each</label>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: maxDepth }, (_, i) => i + 1).map(d => {
                  const active = Math.min(depth, maxDepth) === d
                  const label = d === 1 ? 'Top deck' : d === maxDepth ? 'Subdeck' : `Level ${d}`
                  return (
                    <button
                      key={d}
                      onClick={() => { setDepth(d); setSkipped(new Set()) }}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                        active ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">The top deck becomes a collection holding the sets.</p>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
            {groups.map(g => (
              <label key={g.key} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <input
                  type="checkbox"
                  checked={!skipped.has(g.key)}
                  onChange={() => setSkipped(prev => { const next = new Set(prev); if (next.has(g.key)) next.delete(g.key); else next.add(g.key); return next })}
                  className="accent-indigo-600"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{g.name}</span>
                  {g.collection && <span className="block text-xs text-amber-600 dark:text-amber-400 truncate">in {g.collection}</span>}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{g.cards.length} card{g.cards.length !== 1 ? 's' : ''}</span>
              </label>
            ))}
          </div>

          {samples.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Preview</p>
              <div className="space-y-2">
                {samples.map((c, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3.5 text-sm">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{TYPE_LABELS[c.type]}</p>
                    <ContentRenderer text={c.question.replace(/^!\[[^\]]*\]\(anki-media\/\d+\)$/gm, '*(image)*')} readOnly className="text-gray-900 dark:text-gray-100" />
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                      <ContentRenderer text={c.answer.replace(/^!\[[^\]]*\]\(anki-media\/\d+\)$/gm, '*(image)*')} readOnly />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={runImport}
            disabled={!!progress || cardCount === 0}
            className="w-full bg-indigo-600 text-white py-3.5 rounded-2xl font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors"
          >
            {progress ?? `Import ${cardCount.toLocaleString()} card${cardCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  )
}
