'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { MAX_CARDS_PER_SET } from '@/lib/fetchAll'
import { CardForm, type CardDraft } from '@/components/CardForm'

export default function CreateCard() {
  const { id: setId } = useParams<{ id: string }>()
  const router = useRouter()

  async function save(card: CardDraft): Promise<string | null> {
    const { count } = await supabase
      .from('flashcards')
      .select('id', { count: 'exact', head: true })
      .eq('set_id', setId)
    if ((count ?? 0) >= MAX_CARDS_PER_SET) {
      return `This set already has the maximum of ${MAX_CARDS_PER_SET.toLocaleString()} cards.`
    }

    const { error } = await supabase.from('flashcards').insert({ set_id: setId, ...card })
    if (error) return 'Failed to save. Please try again.'
    router.push(`/sets/${setId}`)
    return null
  }

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/sets/${setId}`} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">New Card</h1>
      </div>

      <CardForm submitLabel="Save Card" onSubmit={save} />
    </div>
  )
}
