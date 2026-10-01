'use client'

import { useEffect, useRef, useState } from 'react'

export interface QuickAction {
  label: string
  description?: string
  run: () => void
  // Shown greyed out, so the numbers of the other actions never shift
  disabled?: boolean
}

// The "Search" quick action: focuses the page's search box once it's there (after the menu has
// closed, or a tab switch has rendered it)
export function focusSearch(tries = 20) {
  setTimeout(() => {
    const box = document.querySelector<HTMLInputElement>('input[type="search"]')
    if (!box) { if (tries > 0) focusSearch(tries - 1); return }
    box.scrollIntoView({ block: 'center', behavior: 'smooth' })
    box.focus({ preventScroll: true })
  }, 25)
}

// Keyboard quick actions: ` opens a numbered menu, then a number key runs that action (so ` 1, ` 2 …
// become shortcuts). Esc or ` again closes it. Keys typed into inputs and editors are ignored.
export function QuickActions({ actions, enabled = true }: { actions: QuickAction[]; enabled?: boolean }) {
  const [open, setOpen] = useState(false)
  // Read by the listener, which is added once
  const state = useRef({ open, actions, enabled })
  state.current = { open, actions, enabled }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const { open, actions, enabled } = state.current
      if (!open) {
        if (e.key === '`' && enabled) { e.preventDefault(); setOpen(true) }
        return
      }
      e.preventDefault()
      if (e.key === 'Escape' || e.key === '`') { setOpen(false); return }
      const action = actions[Number(e.key) - 1]
      if (/^[1-9]$/.test(e.key) && action && !action.disabled) {
        setOpen(false)
        action.run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setOpen(false)} />
      <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh] pointer-events-none">
        <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden pointer-events-auto fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Quick actions</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Press a number · Esc to close</p>
          </div>
          <div className="py-1">
            {actions.map((a, i) => (
              <button
                key={a.label}
                onClick={() => { setOpen(false); a.run() }}
                disabled={a.disabled}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                <kbd className="flex-shrink-0 w-6 h-6 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center font-sans text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {i + 1}
                </kbd>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.label}</p>
                  {a.description && <p className="text-xs text-gray-400 dark:text-gray-500">{a.description}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
