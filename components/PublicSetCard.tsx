import Link from 'next/link'
import { ItemIcon } from '@/components/ItemIcon'
import { noOrphan } from '@/lib/text'
import { paths } from '@/lib/paths'

export interface PublicSet {
  id: string
  name: string
  description: string | null
  tags: string[]
  icon: string | null
  color: string | null
  owner_name: string | null
  owner_avatar: string | null
  card_count: number
}

// Someone else's public set, as listed in Discover and shared collections
export function PublicSetCard({ set, onTagClick }: { set: PublicSet; onTagClick?: (tag: string) => void }) {
  return (
    <Link
      href={paths.set(set.id)}
      className="h-full flex items-start gap-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
    >
      <ItemIcon icon={set.icon} color={set.color} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-snug text-pretty">{noOrphan(set.name)}</p>
          <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-full px-2.5 py-1 font-medium">
            {set.card_count} card{set.card_count !== 1 ? 's' : ''}
          </span>
        </div>
        {set.description && (
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2">{set.description}</p>
        )}
        {set.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {set.tags.map(t => (
              <button
                key={t}
                type="button"
                onClick={e => { e.preventDefault(); e.stopPropagation(); onTagClick?.(t) }}
                        disabled={!onTagClick}
                className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
              >
                #{t}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2.5">
          {set.owner_avatar ? (
            <img src={set.owner_avatar} alt="" className="w-5 h-5 rounded-full" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs font-bold">
              {(set.owner_name ?? '?')[0].toUpperCase()}
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">{set.owner_name ?? 'Unknown'}</p>
        </div>
      </div>
    </Link>
  )
}
