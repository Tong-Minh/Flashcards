'use client'

import { useEffect } from 'react'

export interface Toast {
  id: number
  message: string
  onUndo?: () => void
}

// Bottom toast that disappears after a few seconds, with an optional Undo action
export function UndoToast({ toast, onDismiss, raised }: {
  toast: Toast | null
  onDismiss: () => void
  // Sit above the selection bar when it's showing
  raised?: boolean
}) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [toast?.id])

  if (!toast) return null
  return (
    <div className={`fixed left-0 right-0 z-50 flex justify-center px-4 pointer-events-none ${raised ? 'bottom-24' : 'bottom-6'}`}>
      <div className="pointer-events-auto flex items-center gap-4 max-w-lg w-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl shadow-lg px-4 py-3 fade-in">
        <p className="flex-1 text-sm">{toast.message}</p>
        {toast.onUndo && (
          <button
            onClick={() => { toast.onUndo?.(); onDismiss() }}
            className="text-sm font-semibold text-indigo-300 dark:text-indigo-600 hover:underline"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  )
}
