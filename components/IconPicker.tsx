'use client'

import { useState } from 'react'
import { ICONS, ICON_COLORS, DEFAULT_SET_ICON, DEFAULT_COLLECTION_ICON } from '@/lib/icons'
import { ItemIcon } from '@/components/ItemIcon'

// Tile button showing the current icon; tapping it opens a sheet to pick an icon and color.
export function IconPicker({ icon, color, kind = 'set', onChange }: {
  icon: string | null
  color: string | null
  kind?: 'set' | 'collection'
  onChange: (next: { icon: string; color: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const fallback = kind === 'collection' ? DEFAULT_COLLECTION_ICON : DEFAULT_SET_ICON
  const current  = { icon: icon ?? fallback.icon, color: color ?? fallback.color }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-shrink-0 rounded-xl ring-offset-2 dark:ring-offset-gray-900 hover:ring-2 hover:ring-indigo-300 dark:hover:ring-indigo-700 transition-shadow"
        aria-label="Choose icon"
        title="Choose icon"
      >
        <ItemIcon icon={current.icon} color={current.color} kind={kind} size="lg" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <p className="font-semibold text-gray-900 dark:text-gray-100">Choose an icon</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-1"
              >
                Done
              </button>
            </div>

            <div className="flex gap-2 px-4 pb-3 border-b border-gray-100 dark:border-gray-700">
              {Object.entries(ICON_COLORS).map(([name, c]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange({ icon: current.icon, color: name })}
                  className={`w-7 h-7 rounded-full ${c.swatch} ${current.color === name ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800' : ''}`}
                  aria-label={name}
                />
              ))}
            </div>

            <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5 p-4 overflow-y-auto">
              {Object.keys(ICONS).map(name => {
                const selected = current.icon === name
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onChange({ icon: name, color: current.color })}
                    className={`flex items-center justify-center rounded-xl p-1 transition-colors ${
                      selected ? 'ring-2 ring-indigo-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    aria-label={name}
                    title={name}
                  >
                    <ItemIcon icon={name} color={selected ? current.color : 'gray'} kind={kind} size="sm" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
