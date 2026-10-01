'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRouteIds } from '@/lib/useRouteIds'
import Link from 'next/link'
import { store } from '@/lib/store'
import { CardForm, type CardDraft } from '@/components/CardForm'
import { paths } from '@/lib/paths'
import { confirmAction } from '@/lib/dialogs'

export default function EditCard() {
  const { id: setId, cardId } = useRouteIds()
  const router = useRouter()

  const [card,     setCard]     = useState<CardDraft | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadCard() }, [cardId])

  async function loadCard() {
    const c = await store.getCard(cardId).catch(() => null)
    if (!c) { router.push(paths.set(setId)); return }
    setCard({ type: c.type, question: c.question, answer: c.answer, options: c.options, pairs: c.pairs, reverse: c.reverse ?? false })
  }

  async function save(next: CardDraft): Promise<string | null> {
    try {
      await store.updateCard(cardId, next)
    } catch {
      return 'Failed to save. Please try again.'
    }
    router.push(paths.set(setId))
    return null
  }

  async function handleDelete() {
    if (!await confirmAction('Delete this card?')) return
    setDeleting(true)
    await store.deleteCards([cardId]).catch(() => {})
    router.push(paths.set(setId))
  }

  if (!card) {
    return <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:py-10 text-center text-gray-400 dark:text-gray-500">Loading...</div>
  }

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href={paths.set(setId)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Edit Card</h1>
      </div>

      <CardForm initial={card} submitLabel="Save Changes" onSubmit={save} />

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="w-full mt-3 py-4 rounded-2xl border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 font-semibold text-base hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 disabled:opacity-50 transition-colors"
      >
        {deleting ? 'Deleting...' : 'Delete Card'}
      </button>
    </div>
  )
}
