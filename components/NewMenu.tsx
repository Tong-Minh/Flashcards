'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'

const ITEMS = [
  { href: '/sets/new',        title: 'New set',          desc: 'A deck of cards to study' },
  { href: '/collections/new', title: 'New collection',   desc: 'A folder to group sets together' },
  { href: '/import-anki',     title: 'Import from Anki', desc: 'An .apkg deck or a text export', divider: true },
]

// "+ New": a set, a collection, or an Anki import. In the sidebar (full width, menu below) and the
// home header (menu on the right).
export function NewMenu({ full, label = 'New' }: { full?: boolean; label?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`relative ${full ? 'w-full' : ''}`}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className={`flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors ${
          full ? 'w-full py-2' : 'px-4 py-2'
        }`}
      >
        <Plus size={16} strokeWidth={2.5} /> {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className={`absolute top-full mt-2 z-40 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 overflow-hidden ${full ? 'left-0' : 'right-0'}`}>
            {ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${item.divider ? 'border-t border-gray-100 dark:border-gray-700' : ''}`}
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.desc}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
