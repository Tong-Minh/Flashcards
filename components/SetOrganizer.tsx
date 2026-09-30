'use client'

import { useRef, useState } from 'react'
import {
  DndContext, PointerSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers'
import { GripVertical } from 'lucide-react'
import { store } from '@/lib/store'
import { useLongPress } from '@/lib/useLongPress'
import { useMediaQuery, DESKTOP_QUERY } from '@/lib/useMediaQuery'
import {
  moveSets, setSetsVisibility, deleteSets, reorderSets, sortSets, type SetWithStats,
} from '@/lib/sets'
import { SetCard, CollectionCard } from '@/components/SetCard'
import { MoveSheet } from '@/components/MoveSheet'
import { UndoToast, type Toast } from '@/components/UndoToast'
import type { Collection } from '@/lib/types'

const COLLECTION_DROP = 'collection:'

// Prefer whatever is under the pointer (so a set can be dropped onto a collection card), and fall
// back to the nearest set for reordering.
const collision: CollisionDetection = args => {
  const hits = pointerWithin(args)
  return hits.length ? hits : closestCenter(args)
}

// A list of the user's sets that can be organized:
// - Long-press a set (or tap Select) to enter selection mode, then Move / Public·Private / Delete.
// - In selection mode, drag a set by its handle onto another to reorder (when `sortable`), or onto a
//   collection card to move it. Outside selection mode sets can't be dragged.
export function SetOrganizer({
  allSets, onSetsChange, collections, onCollectionsChange,
  listSets, dropCollections = [], setsByCollection = {}, sortable, label, title, actions, currentCollectionId = null, empty,
}: {
  allSets: SetWithStats[]
  onSetsChange: (next: SetWithStats[]) => void
  collections: Collection[]
  onCollectionsChange: (next: Collection[]) => void
  // Sets shown, in display order
  listSets: SetWithStats[]
  // Collection cards shown above the sets; sets can be dropped onto them
  dropCollections?: Collection[]
  setsByCollection?: Record<string, SetWithStats[]>
  // Off while a search or filter is hiding some sets
  sortable: boolean
  label?: string | null
  // Replaces the small label with a heading, and extra buttons shown beside Select
  title?: React.ReactNode
  actions?: React.ReactNode
  // The collection page these sets are being viewed in
  currentCollectionId?: string | null
  empty?: React.ReactNode
}) {
  const [selecting, setSelecting] = useState(false)
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [showMove,  setShowMove]  = useState(false)
  const [busy,      setBusy]      = useState(false)
  const [toast,     setToast]     = useState<Toast | null>(null)
  // A drag ends with a click on whatever is under the pointer; swallow it so the card doesn't open
  const suppressClick = useRef(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  // Desktop lays sets out in a grid, so drags move in both directions there
  const grid    = useMediaQuery(DESKTOP_QUERY)

  function enterSelect(id?: string) {
    setSelecting(true)
    setSelected(new Set(id ? [id] : []))
  }

  function exitSelect() {
    setSelecting(false)
    setSelected(new Set())
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function showToast(message: string, onUndo?: () => void) {
    setToast({ id: Date.now(), message, onUndo })
  }

  function patchSets(patch: (s: SetWithStats) => SetWithStats | null) {
    onSetsChange(allSets.flatMap(s => { const p = patch(s); return p ? [p] : [] }))
  }

  async function move(ids: string[], collectionId: string | null, collectionName?: string) {
    const previous = new Map(allSets.filter(s => ids.includes(s.id)).map(s => [s.id, s.collection_id]))
    const moving = ids.filter(id => previous.get(id) !== collectionId)
    if (moving.length === 0) return
    patchSets(s => (moving.includes(s.id) ? { ...s, collection_id: collectionId } : s))
    setShowMove(false)
    exitSelect()
    try {
      await moveSets(moving, collectionId)
    } catch {
      patchSets(s => (previous.has(s.id) ? { ...s, collection_id: previous.get(s.id) ?? null } : s))
      alert('Could not move the sets. Please try again.')
      return
    }
    const where = collectionId
      ? collectionName ?? collections.find(c => c.id === collectionId)?.name ?? 'collection'
      : 'no collection'
    showToast(`Moved ${moving.length} set${moving.length !== 1 ? 's' : ''} to ${where}`, async () => {
      // Put each set back where it came from, grouped by original collection
      const byOrigin = new Map<string | null, string[]>()
      for (const id of moving) byOrigin.set(previous.get(id) ?? null, [...(byOrigin.get(previous.get(id) ?? null) ?? []), id])
      patchSets(s => (previous.has(s.id) ? { ...s, collection_id: previous.get(s.id) ?? null } : s))
      for (const [origin, group] of byOrigin) await moveSets(group, origin).catch(() => {})
    })
  }

  async function setVisibility(isPublic: boolean) {
    const ids = [...selected]
    const previous = new Map(allSets.filter(s => selected.has(s.id)).map(s => [s.id, s.is_public]))
    patchSets(s => (selected.has(s.id) ? { ...s, is_public: isPublic } : s))
    exitSelect()
    try {
      await setSetsVisibility(ids, isPublic)
    } catch {
      patchSets(s => (previous.has(s.id) ? { ...s, is_public: previous.get(s.id)! } : s))
      alert('Could not update the sets. Please try again.')
      return
    }
    showToast(`Made ${ids.length} set${ids.length !== 1 ? 's' : ''} ${isPublic ? 'public' : 'private'}`, async () => {
      patchSets(s => (previous.has(s.id) ? { ...s, is_public: previous.get(s.id)! } : s))
      const wasPublic = ids.filter(id => previous.get(id))
      const wasPrivate = ids.filter(id => !previous.get(id))
      await Promise.all([setSetsVisibility(wasPublic, true), setSetsVisibility(wasPrivate, false)]).catch(() => {})
    })
  }

  async function remove() {
    const ids = [...selected]
    const names = allSets.filter(s => selected.has(s.id)).map(s => s.name)
    const what = ids.length === 1 ? `"${names[0]}"` : `${ids.length} sets`
    if (!confirm(`Delete ${what} and all ${ids.length === 1 ? 'its' : 'their'} cards? This can't be undone.`)) return
    setBusy(true)
    try {
      await deleteSets(ids)
      patchSets(s => (selected.has(s.id) ? null : s))
      exitSelect()
      showToast(`Deleted ${what}`)
    } catch {
      alert('Could not delete the sets. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function createCollection(name: string) {
    let created: Collection
    try {
      created = await store.createCollection({ name })
    } catch {
      alert('Could not create the collection.')
      return
    }
    onCollectionsChange([...collections, created].sort((a, b) => a.name.localeCompare(b.name)))
    await move([...selected], created.id, created.name)
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setTimeout(() => { suppressClick.current = false }, 0)
    if (!over) return
    const activeId = String(active.id)
    const overId   = String(over.id)

    if (overId.startsWith(COLLECTION_DROP)) {
      const ids = selecting && selected.has(activeId) ? [...selected] : [activeId]
      await move(ids, overId.slice(COLLECTION_DROP.length))
      return
    }

    if (!sortable || overId === activeId) return
    const ids  = listSets.map(s => s.id)
    const from = ids.indexOf(activeId)
    const to   = ids.indexOf(overId)
    if (from < 0 || to < 0) return
    const order    = arrayMove(ids, from, to)
    const position = new Map(order.map((id, i) => [id, i + 1]))
    const before   = allSets
    onSetsChange(sortSets(allSets.map(s => (position.has(s.id) ? { ...s, position: position.get(s.id)! } : s))))
    try {
      await reorderSets(order)
    } catch {
      onSetsChange(before)
    }
  }

  const selectedSets = allSets.filter(s => selected.has(s.id))
  const allPublic    = selectedSets.length > 0 && selectedSets.every(s => s.is_public)

  return (
    <div
      className={selecting ? 'pb-28' : ''}
      onClickCapture={e => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation() } }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        // A phone's single-column list only moves up and down; without this a dragged card can slide
        // off sideways forever. The desktop grid moves both ways but stays on screen.
        modifiers={grid ? [restrictToWindowEdges] : [restrictToVerticalAxis, restrictToWindowEdges]}
        onDragStart={() => { suppressClick.current = true }}
        onDragCancel={() => { suppressClick.current = false }}
        onDragEnd={handleDragEnd}
      >
        {dropCollections.length > 0 && (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3 mb-5">
            {dropCollections.map(c => (
              <DroppableCollection key={c.id} collection={c} sets={setsByCollection[c.id] ?? []} />
            ))}
          </div>
        )}

        {(listSets.length > 0 || selecting || actions) && (
          <div className="flex items-center justify-between gap-2 mb-3 min-h-[1.75rem]">
            {title && !selecting ? title : (
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                {selecting ? `${selected.size} selected` : label ?? ''}
              </p>
            )}
            {selecting ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelected(selected.size === listSets.length ? new Set() : new Set(listSets.map(s => s.id)))}
                  className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
                >
                  {selected.size === listSets.length ? 'Select none' : 'Select all'}
                </button>
                <button onClick={exitSelect} className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                  {selected.size === 0 ? 'Cancel' : 'Done'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {listSets.length > 0 && (
                  <button onClick={() => enterSelect()} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 px-2 py-1.5">Select</button>
                )}
                {actions}
              </div>
            )}
          </div>
        )}

        <SortableContext items={listSets.map(s => s.id)} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {listSets.map(set => (
              <SortableSet
                key={set.id}
                set={set}
                selecting={selecting}
                selected={selected.has(set.id)}
                onToggle={() => toggle(set.id)}
                onLongPress={() => (selecting ? toggle(set.id) : enterSelect(set.id))}
              />
            ))}
          </div>
        </SortableContext>
        {listSets.length === 0 && empty}
      </DndContext>

      {selecting && (
        <div className="fixed-bar fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-800/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
            {/* Nothing picked yet: offer a way out in thumb reach instead of disabled actions */}
            {selected.size === 0 ? (
              <BarButton onClick={exitSelect}>Cancel</BarButton>
            ) : (
              <>
                <BarButton onClick={() => setShowMove(true)} disabled={busy} primary>Move</BarButton>
                <BarButton onClick={() => setVisibility(!allPublic)} disabled={busy}>
                  {allPublic ? 'Make private' : 'Make public'}
                </BarButton>
                <BarButton onClick={remove} disabled={busy} danger>Delete</BarButton>
              </>
            )}
          </div>
        </div>
      )}

      {showMove && (
        <MoveSheet
          count={selected.size}
          collections={collections}
          currentCollectionId={currentCollectionId}
          onPick={id => move([...selected], id)}
          onCreate={createCollection}
          onClose={() => setShowMove(false)}
        />
      )}

      <UndoToast toast={toast} onDismiss={() => setToast(null)} raised={selecting} />
    </div>
  )
}

function BarButton({ onClick, disabled, primary, danger, children }: {
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${
        primary ? 'bg-indigo-600 text-white hover:bg-indigo-700'
        : danger ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  )
}

function SortableSet({ set, selecting, selected, onToggle, onLongPress }: {
  set: SetWithStats
  selecting: boolean
  selected: boolean
  onToggle: () => void
  onLongPress: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: set.id })
  const longPress = useLongPress(onLongPress)

  // Dragging only starts from the handle, which appears in selection mode (mouse and touch alike),
  // so outside selection mode a set can't be moved by accident.
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative h-full [-webkit-touch-callout:none] ${isDragging ? 'z-10 opacity-80 shadow-xl rounded-2xl' : ''}`}
      {...attributes}
      role={undefined}
      tabIndex={undefined}
      {...longPress}
    >
      <SetCard
        set={set}
        selecting={selecting}
        selected={selected}
        onToggle={onToggle}
        handle={
          <span
            ref={setActivatorNodeRef}
            {...listeners}
            onClickCapture={e => { e.preventDefault(); e.stopPropagation() }}
            className="touch-none cursor-grab active:cursor-grabbing p-1 text-gray-400 dark:text-gray-500"
            aria-label="Drag to reorder or move"
          >
            <GripVertical size={18} />
          </span>
        }
      />
    </div>
  )
}

function DroppableCollection({ collection, sets }: { collection: Collection; sets: SetWithStats[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: COLLECTION_DROP + collection.id })
  return (
    <div ref={setNodeRef} className="h-full">
      <CollectionCard
        id={collection.id}
        name={collection.name}
        description={collection.description}
        tags={collection.tags ?? []}
        icon={collection.icon}
        color={collection.color}
        sets={sets}
        dropActive={isOver}
      />
    </div>
  )
}
