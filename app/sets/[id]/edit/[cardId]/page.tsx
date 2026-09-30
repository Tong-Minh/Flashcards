'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { CardForm, type CardDraft } from '@/components/CardForm'
import type { Flashcard } from '@/lib/types'

export default function EditCard() {
  const { id: setId, cardId } = useParams<{ id: string; cardId: string }>()
  const router = useRouter()

  const [card,     setCard]     = useState<CardDraft | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadCard() }, [cardId])

  async function loadCard() {
    const { data } = await supabase.from('flashcards').select('*').eq('id', cardId).single()
    if (!data) { router.push(`/sets/${setId}`); return }
    const c = data as Flashcard
    setCard({ type: c.type, question: c.question, answer: c.answer, options: c.options, pairs: c.pairs })
  }

  async function save(next: CardDraft): Promise<string | null> {
    const { error } = await supabase.from('flashcards').update(next).eq('id', cardId)
    if (error) return 'Failed to save. Please try again.'
    router.push(`/sets/${setId}`)
    return null
  }

  async function handleDelete() {
    if (!confirm('Delete this card?')) return
    setDeleting(true)
    await supabase.from('flashcards').delete().eq('id', cardId)
    router.push(`/sets/${setId}`)
  }

  if (!card) {
    return <div className="max-w-lg mx-auto px-4 py-6 text-center text-gray-400 dark:text-gray-500">Loading...</div>
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/sets/${setId}`} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors">
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
