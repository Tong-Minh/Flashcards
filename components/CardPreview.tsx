'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { ContentRenderer, hasCodeBlock } from '@/components/ContentRenderer'
import { haptic, hasTextSelection } from '@/lib/haptic'
import { MatchingPairsList } from '@/components/StudyInteractions'
import type { Flashcard } from '@/lib/types'

// ── Fill-in-the-blank renderer ────────────────────────────────────────────────

export function ClozeQuestion({ sentence, answer }: { sentence: string; answer?: string }) {
  const parts = sentence.split('___')
  const withCode = hasCodeBlock(sentence)

  if (withCode) {
    return (
      <div className="text-xl font-medium text-gray-900 dark:text-gray-100 leading-relaxed flex-1">
        {parts.map((part, i) => (
          <Fragment key={i}>
            {part && <ContentRenderer text={part} readOnly />}
            {i < parts.length - 1 && (
              answer
                ? <span className="inline-block bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 font-semibold px-2 py-0.5 rounded mx-0.5"><ContentRenderer text={answer} readOnly /></span>
                : <span className="inline-block border-b-2 border-gray-400 dark:border-gray-500 w-16 mx-1 align-bottom" />
            )}
          </Fragment>
        ))}
      </div>
    )
  }

  return (
    <p className="text-xl font-medium text-gray-900 dark:text-gray-100 leading-relaxed flex-1">
      {parts.map((part, i) => (
        <span key={i}>
          {part && <ContentRenderer text={part} readOnly />}
          {i < parts.length - 1 && (
            answer
              ? <span className="inline-block bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 font-semibold px-2 py-0.5 rounded mx-0.5"><ContentRenderer text={answer} readOnly /></span>
              : <span className="inline-block border-b-2 border-gray-400 dark:border-gray-500 w-16 mx-1 align-bottom" />
          )}
        </span>
      ))}
    </p>
  )
}

// ── Flip card (no scheduling — used by preview and view mode) ────────────────

const SWIPE_DISMISS_PX = 100
const TAP_SLOP_PX      = 8
const FLY_OUT_MS       = 250

interface FlipCardProps {
  card: Flashcard
  // When set, the card can be dragged and is dismissed past a threshold.
  onSwipeAway?: () => void
  className?: string
}

// Remount (via `key`) to reset to the front face.
export function FlipCard({ card, onSwipeAway, className = '' }: FlipCardProps) {
  const [showBack, setShowBack] = useState(false)
  const [flipping, setFlipping] = useState(false)
  // The enter animation must only play on mount; re-applying it after a flip replays a rotation
  const [entered,  setEntered]  = useState(false)
  const [drag,     setDrag]     = useState<{ x: number; y: number } | null>(null)
  // Where a dismissed card flies to before onSwipeAway runs
  const [flyOut,   setFlyOut]   = useState<{ x: number; y: number } | null>(null)
  const start   = useRef<{ x: number; y: number } | null>(null)
  const moved   = useRef(false)
  const timers  = useRef<ReturnType<typeof setTimeout>[]>([])
  const cardRef = useRef<HTMLDivElement>(null)
  // While the back shows, the front's height: a shorter back doesn't shrink the card, a longer one
  // grows it, and flipping back to the front returns the card to the front's own size
  const [minHeight, setMinHeight] = useState<number>()

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function flip() {
    if (flipping) return
    setMinHeight(showBack ? undefined : cardRef.current?.offsetHeight)
    haptic(20)
    setEntered(true)
    setFlipping(true)
    timers.current.push(setTimeout(() => setShowBack(b => !b), 150))
    timers.current.push(setTimeout(() => setFlipping(false), 300))
  }

  function onPointerDown(e: React.PointerEvent) {
    // Let controls inside rendered content (e.g. code block expand) handle their own clicks.
    if (e.button !== 0 || (e.target as HTMLElement).closest('a, button, select')) return
    start.current = { x: e.clientX, y: e.clientY }
    moved.current = false
    if (onSwipeAway) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current || !onSwipeAway) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (!moved.current && Math.hypot(dx, dy) > TAP_SLOP_PX) moved.current = true
    if (moved.current) setDrag({ x: dx, y: dy })
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    start.current = null
    if (!moved.current && !hasTextSelection()) {
      setDrag(null)
      flip()
    } else if (onSwipeAway && (Math.abs(dx) > SWIPE_DISMISS_PX || (e.pointerType === "mouse" && Math.hypot(dx, dy) > SWIPE_DISMISS_PX))) {
      haptic(15)
      // Carry on in the swipe's direction until off screen, fading out, then dismiss
      const len  = Math.max(Math.hypot(dx, dy), 1)
      const dist = Math.max(window.innerWidth, window.innerHeight)
      setDrag(null)
      setFlyOut({ x: dx + (dx / len) * dist, y: dy + (dy / len) * dist })
      timers.current.push(setTimeout(onSwipeAway, FLY_OUT_MS))
    } else {
      setDrag(null)
    }
  }

  const dragStyle = flyOut
    ? {
        transform: `translate(${flyOut.x}px, ${flyOut.y}px) rotate(${flyOut.x / 20}deg)`,
        opacity: 0,
        transition: `transform ${FLY_OUT_MS}ms ease-in, opacity ${FLY_OUT_MS}ms ease-in`,
        pointerEvents: 'none' as const,
      }
    : drag
    ? {
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 20}deg)`,
        opacity: Math.max(0.3, 1 - Math.hypot(drag.x, drag.y) / 400),
        transition: 'none',
      }
    : { transition: 'transform 0.2s ease-out, opacity 0.2s ease-out' }

  return (
    <div style={dragStyle} className={onSwipeAway ? "select-none [touch-action:pan-y]" : ""}>
      <div
        ref={cardRef}
        style={{ minHeight }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { start.current = null; setDrag(null) }}
        className={`${flipping ? 'card-flip' : entered ? '' : 'card-enter'} bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 p-6 min-h-[260px] flex flex-col cursor-pointer ${className}`}
      >
        <p className={`text-xs font-medium uppercase tracking-wide mb-3 ${showBack ? 'text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`}>
          {showBack ? (card.type === 'matching' ? 'Pairs' : 'Answer')
            : card.type === 'multiple_choice' ? 'Multiple Choice'
            : card.type === 'fill_blank' ? 'Fill in the blank'
            : card.type === 'typed' ? 'Type the answer'
            : card.type === 'true_false' ? 'True or false?'
            : card.type === 'matching' ? 'Matching'
            : 'Question'}
        </p>

        {!showBack ? (
          <div className="flex flex-col flex-1">
            {card.type === 'fill_blank'
              ? <ClozeQuestion sentence={card.question} />
              : <ContentRenderer
                  text={card.type === 'matching' && !card.question.trim() ? 'Match the pairs' : card.question}
                  className="text-xl font-medium text-gray-900 dark:text-gray-100 leading-relaxed"
                  readOnly
                />}
            {card.type === 'matching' && card.pairs && (
              <div className="mt-5 flex flex-wrap gap-2">
                {card.pairs.map((p, i) => (
                  <div key={i} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                    <ContentRenderer text={p.left} readOnly />
                  </div>
                ))}
              </div>
            )}
            {card.type === 'multiple_choice' && card.options && (
              <div className="mt-5 space-y-2">
                {card.options.map((opt, i) => (
                  <div key={i} className="px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 font-medium">
                    <span className="text-gray-400 dark:text-gray-500 mr-2">{String.fromCharCode(65 + i)}.</span>
                    <ContentRenderer text={opt} readOnly />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : card.type === 'fill_blank' ? (
          <ClozeQuestion sentence={card.question} answer={card.answer} />
        ) : card.type === 'matching' ? (
          <MatchingPairsList pairs={card.pairs ?? []} />
        ) : (
          <div className="flex flex-col flex-1">
            <ContentRenderer text={card.answer} className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-relaxed" readOnly />
            {card.type === 'typed' && card.options && card.options.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Also accepted: {card.options.join(', ')}</p>
            )}
            {card.type === 'multiple_choice' && card.options && (
              <div className="mt-4 space-y-1.5">
                {card.options.map((opt, i) => {
                  const isCorrect = opt === card.answer
                  return (
                    <div key={i} className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${
                      isCorrect
                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium border border-green-200 dark:border-green-800'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      <span>{String.fromCharCode(65 + i)}.</span>
                      <ContentRenderer text={opt} readOnly />
                      {isCorrect && <span className="ml-auto">✓</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-center text-gray-300 dark:text-gray-600 mt-5">Tap to flip</p>
      </div>
    </div>
  )
}

// ── Preview modal ─────────────────────────────────────────────────────────────

export function CardPreviewModal({ card, onClose }: { card: Flashcard; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    // The backdrop itself scrolls (for tall cards) so nothing around the card clips its flip or swipe;
    // an inner scroll box would cut the card off at its edges.
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black/50 fade-in">
      <div
        className="min-h-full flex items-center justify-center px-4 py-12"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="w-full max-w-lg">
          <FlipCard key={card.id} card={card} onSwipeAway={onClose} />
        </div>
      </div>
    </div>
  )
}
