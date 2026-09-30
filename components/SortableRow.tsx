'use client'

import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

type Listeners = ReturnType<typeof useSortable>['listeners']

// One item in a dnd-kit sortable list. `children` gets the drag listeners (to spread on the whole row
// for mouse dragging) and a ready-made grip handle (for touch dragging, which only starts from the handle
// so a finger on the row still scrolls the page).
export function SortableRow({ id, disabled, className = '', children }: {
  id: string
  disabled?: boolean
  className?: string
  children: (drag: { listeners: Listeners; handle: ReactNode; dragging: boolean }) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled })

  const handle = (
    <span
      ref={setActivatorNodeRef}
      {...listeners}
      onClick={e => { e.preventDefault(); e.stopPropagation() }}
      className="touch-none cursor-grab active:cursor-grabbing p-1 text-gray-400 dark:text-gray-500"
      aria-label="Drag to reorder"
    >
      <GripVertical size={18} />
    </span>
  )

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative ${isDragging ? 'z-10 opacity-80 shadow-xl rounded-xl' : ''} ${className}`}
      {...attributes}
      role={undefined}
      tabIndex={undefined}
    >
      {children({ listeners, handle, dragging: isDragging })}
    </div>
  )
}
