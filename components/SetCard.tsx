import Link from 'next/link'
import { TagList } from '@/components/TagInput'
import type { SetWithStats } from '@/lib/sets'

export function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) {
    const h = date.getHours() % 12 || 12
    const m = date.getMinutes().toString().padStart(2, '0')
    const ampm = date.getHours() >= 12 ? 'pm' : 'am'
    return `Today ${h}:${m}${ampm}`
  }
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function SetCard({ set }: { set: SetWithStats }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <Link href={`/sets/${set.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-snug">{set.name}</h2>
              {!set.is_public && (
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 px-1.5 py-0.5 rounded-full">Private</span>
              )}
            </div>
            {set.description && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{set.description}</p>
            )}
            <TagList tags={set.tags} className="mt-1.5" />
          </div>
          {set.toStudy > 0 && (
            <span className="flex-shrink-0 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-full">
              {set.toStudy} to study
            </span>
          )}
          {set.toStudy === 0 && set.totalCards > 0 && (
            <span className="flex-shrink-0 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full">
              Mastered
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
          <span>{set.totalCards} card{set.totalCards !== 1 ? 's' : ''}</span>
          <span>{set.totalSessions} session{set.totalSessions !== 1 ? 's' : ''}</span>
          <span>Last: {timeAgo(set.lastStudied)}</span>
        </div>

        {set.totalCards > 0 && (
          <div className="mt-3 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all"
              style={{ width: `${Math.round(((set.totalCards - set.toStudy) / set.totalCards) * 100)}%` }}
            />
          </div>
        )}
      </Link>

      <div className="flex border-t border-gray-100 dark:border-gray-700">
        <Link
          href={`/sets/${set.id}/study`}
          className="flex-1 text-center py-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        >
          Study
        </Link>
        <Link
          href={`/sets/${set.id}`}
          className="flex-1 text-center py-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          Manage
        </Link>
      </div>
    </div>
  )
}

export function CollectionCard({ id, name, description, tags, sets }: {
  id: string
  name: string
  description: string | null
  tags: string[]
  sets: SetWithStats[]
}) {
  const totalCards = sets.reduce((n, s) => n + s.totalCards, 0)
  const toStudy    = sets.reduce((n, s) => n + s.toStudy, 0)
  return (
    <Link
      href={`/collections/${id}`}
      className="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-snug">{name}</h2>
          {toStudy > 0 && (
            <span className="flex-shrink-0 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-full">
              {toStudy} to study
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{description}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 mt-1.5">
          <span>{sets.length} set{sets.length !== 1 ? 's' : ''}</span>
          <span>{totalCards} card{totalCards !== 1 ? 's' : ''}</span>
        </div>
        <TagList tags={tags} className="mt-2" />
      </div>
    </Link>
  )
}
