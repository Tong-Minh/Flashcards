import Link from 'next/link'
import type { ReactNode } from 'react'
import { ItemIcon } from '@/components/ItemIcon'
import { TagList } from '@/components/TagInput'
import { noOrphan } from '@/lib/text'
import { paths } from '@/lib/paths'
import { SourceLink } from '@/components/SourceLink'

// Shared header for set and collection pages: a label row (what it is, and for a set, which
// collection it's in), then the icon with the name and description beside it, then tags.
export function DetailHeader({ kind, backHref, collection, owner, icon, color, name, description, badge, tags, actions, sourceUrl }: {
  kind: 'set' | 'collection'
  backHref: string
  // Sets only: the collection it belongs to
  collection?: { id: string; name: string } | null
  // Someone else's item: shown as "by …"
  owner?: string | null
  icon: string | null | undefined
  color: string | null | undefined
  name: string | undefined
  description?: string | null
  badge?: ReactNode
  tags?: string[]
  actions?: ReactNode
  // Where it came from: a link icon right after the title
  sourceUrl?: string | null
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-3">
        <Link href={backHref} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors flex-shrink-0">←</Link>
        <p className="flex-1 min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {kind === 'collection' ? (
            <span className="text-amber-600 dark:text-amber-400">Collection</span>
          ) : (
            <span className="text-indigo-600 dark:text-indigo-400">Set</span>
          )}
          {collection && (
            <>
              {' · in '}
              <Link href={paths.collection(collection.id)} className="text-amber-600 dark:text-amber-400 hover:underline">
                {collection.name}
              </Link>
            </>
          )}
          {owner && <> · by {owner}</>}
        </p>
        {actions && <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>}
      </div>

      <div className="flex items-center gap-3">
        <ItemIcon icon={icon} color={color} kind={kind} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-snug text-pretty">
            {noOrphan(name)}
            {/* A box exactly one title line tall, with the pill centered in it, so the pill lines up with
                the title text and doesn't make its line taller */}
            {badge && <span className="inline-flex items-center align-top h-[1.375em] ml-2 [&>*]:leading-4">{badge}</span>}
            {sourceUrl && <span className="inline-flex items-center align-top h-[1.375em] ml-1"><SourceLink url={sourceUrl} /></span>}
          </h1>
          {description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <TagList tags={tags} className="mt-3" />
    </div>
  )
}

export function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1"
      aria-label="Settings"
      title="Settings"
    >
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>
  )
}
