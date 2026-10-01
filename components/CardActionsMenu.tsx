'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'

// A card's ⋯ menu in the set's card list: edit it, or delete it. Pointer and click events stop here,
// so opening the menu doesn't open the card preview, start a long-press selection, or drag the card.
export function CardActionsMenu({ editHref, onDelete }: { editHref: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <div className="relative flex-shrink-0" onClick={stop} onPointerDown={stop} onTouchStart={stop} onContextMenu={stop}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="Card options"
        title="Card options"
        className="p-1.5 -m-1 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 overflow-hidden">
            <Link href={editHref} className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <Pencil size={15} /> Edit card
            </Link>
            <button
              type="button"
              onClick={() => { setOpen(false); onDelete() }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 size={15} /> Delete card
            </button>
          </div>
        </>
      )}
    </div>
  )
}
