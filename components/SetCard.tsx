import Link from 'next/link'
import type { ReactNode } from 'react'
import { TagList } from '@/components/TagInput'
import { ItemIcon } from '@/components/ItemIcon'
import { noOrphan } from '@/lib/text'
import type { SetWithStats } from '@/lib/sets'
import { paths } from '@/lib/paths'
import { IS_DESKTOP } from '@/lib/platform'

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

export function SetCard({ set, selecting, selected, onToggle, handle }: {
  set: SetWithStats
  // Selection mode: tapping anywhere toggles the card instead of opening it
  selecting?: boolean
  selected?: boolean
  onToggle?: () => void
  // Drag handle shown in selection mode (touch devices drag by this)
  handle?: ReactNode
}) {
  return (
    <div
      onClickCapture={selecting ? e => { e.preventDefault(); e.stopPropagation(); onToggle?.() } : undefined}
      className={`h-full flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border overflow-hidden transition-colors ${
        selected ? 'border-indigo-500 ring-2 ring-indigo-500/40' : 'border-gray-100 dark:border-gray-700'
      } ${selecting ? 'cursor-pointer select-none' : ''}`}
    >
      <Link href={paths.set(set.id)} className="flex flex-col flex-1 p-4 hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors">
        <div className="flex items-start justify-between gap-2 mb-3">
          <ItemIcon icon={set.icon} color={set.color} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-snug text-pretty">{noOrphan(set.name)}</h2>
              {!IS_DESKTOP && !set.is_public && (
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 px-1.5 py-0.5 rounded-full">Private</span>
              )}
            </div>
            {set.description && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{set.description}</p>
            )}
            <TagList tags={set.tags} className="mt-1.5" />
          </div>
          {selecting ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              {handle}
              <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600'
              }`}>
                {selected && '✓'}
              </span>
            </div>
          ) : set.toStudy > 0 ? (
            <span className="flex-shrink-0 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-full">
              {set.toStudy} to study
            </span>
          ) : set.totalCards > 0 && (
            <span className="flex-shrink-0 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full">
              Mastered
            </span>
          )}
        </div>

        {/* mt-auto: in the desktop grid, cards in a row share a height, so stats line up at the bottom */}
        <div className="mt-auto flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
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
          href={paths.study(set.id)}
          className="flex-1 text-center py-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        >
          Study
        </Link>
        <Link
          href={paths.set(set.id)}
          className="flex-1 text-center py-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          Manage
        </Link>
      </div>
    </div>
  )
}

export function CollectionCard({ id, name, description, tags, icon, color, sets, dropActive }: {
  id: string
  // A set is being dragged over this collection
  dropActive?: boolean
  icon: string | null
  color: string | null
  name: string
  description: string | null
  tags: string[]
  sets: SetWithStats[]
}) {
  const totalCards = sets.reduce((n, s) => n + s.totalCards, 0)
  const toStudy    = sets.reduce((n, s) => n + s.toStudy, 0)
  return (
    <Link
      href={paths.collection(id)}
      className={`h-full flex items-start gap-3 rounded-2xl shadow-sm border p-4 transition-colors ${
        dropActive
          ? 'border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-50 dark:bg-indigo-900/30'
          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'
      }`}
    >
      <ItemIcon icon={icon} color={color} kind="collection" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-snug text-pretty">{noOrphan(name)}</h2>
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
