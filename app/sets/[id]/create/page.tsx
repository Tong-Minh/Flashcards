'use client'

import { useRouter } from 'next/navigation'
import { useRouteIds } from '@/lib/useRouteIds'
import Link from 'next/link'
import { store } from '@/lib/store'
import { CardForm, type CardDraft } from '@/components/CardForm'
import { paths } from '@/lib/paths'

export default function CreateCard() {
  const { id: setId } = useRouteIds()
  const router = useRouter()

  async function save(card: CardDraft): Promise<string | null> {
    const count = await store.countCards(setId).catch(() => 0)
    if (count >= store.maxCardsPerSet) {
      return `This set already has the maximum of ${store.maxCardsPerSet.toLocaleString()} cards.`
    }

    try {
      await store.addCards(setId, [card])
    } catch {
      return 'Failed to save. Please try again.'
    }
    router.push(paths.set(setId))
    return null
  }

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href={paths.set(setId)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">New Card</h1>
      </div>

      <CardForm submitLabel="Save Card" onSubmit={save} autoFocus />
    </div>
  )
}
