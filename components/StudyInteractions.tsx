'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ContentRenderer } from '@/components/ContentRenderer'
import { haptic } from '@/lib/haptic'
import type { TypedResult } from '@/lib/answerCheck'
import type { MatchPair } from '@/lib/types'

// Interactive fronts for the typed, true/false, and matching card types. Each reports its outcome
// to the study page, which flips the card and shows the result on the back. Clicks stop here so they
// don't reach the card's tap-to-flip handler.

export function TypedAnswerInput({ onSubmit }: { onSubmit: (input: string) => void }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus({ preventScroll: true }) }, [])

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit(value) }}
      onClick={e => e.stopPropagation()}
      className="mt-5 flex gap-2"
    >
      <input
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Type your answer"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
      >
        Check
      </button>
    </form>
  )
}

export function TypedResultBanner({ input, result }: { input: string; result: TypedResult }) {
  const styles = {
    correct:   { cls: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400', text: '✓ Correct!' },
    close:     { cls: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', text: '≈ Close enough — watch the spelling' },
    incorrect: { cls: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',         text: '✗ Not quite' },
  }[result]
  return (
    <div className={`mb-3 px-4 py-2.5 rounded-xl text-sm ${styles.cls}`}>
      <p className="font-medium">{styles.text}</p>
      {result !== 'correct' && <p className="mt-0.5 opacity-80">You typed: <span className="font-mono">{input}</span></p>}
    </div>
  )
}

export function TrueFalseButtons({ onPick }: { onPick: (value: 'True' | 'False') => void }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2">
      {(['True', 'False'] as const).map(v => (
        <button
          key={v}
          onClick={e => { e.stopPropagation(); haptic(20); onPick(v) }}
          className="py-4 rounded-xl border border-gray-200 dark:border-gray-600 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors"
        >
          {v}
        </button>
      ))}
    </div>
  )
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Tap a term, then its match. Correct pairs lock in green; a wrong pick flashes red and counts as
// a miss. Calls onDone with the miss count once everything is matched.
export function MatchingBoard({ pairs, onDone }: { pairs: MatchPair[]; onDone: (misses: number) => void }) {
  const rightOrder = useMemo(() => {
    const idx = pairs.map((_, i) => i)
    // Avoid a shuffle that lines every match up with its term
    let order = shuffle(idx)
    for (let tries = 0; tries < 5 && pairs.length > 1 && order.every((v, i) => v === i); tries++) order = shuffle(idx)
    return order
  }, [pairs])
  const [activeLeft, setActiveLeft] = useState<number | null>(null)
  const [matched,    setMatched]    = useState<Set<number>>(new Set())
  const [wrong,      setWrong]      = useState<number | null>(null)
  const [misses,     setMisses]     = useState(0)

  function pickRight(i: number) {
    if (activeLeft === null || matched.has(i)) return
    if (i === activeLeft) {
      haptic(20)
      const next = new Set(matched).add(i)
      setMatched(next)
      setActiveLeft(null)
      if (next.size === pairs.length) setTimeout(() => onDone(misses), 350)
    } else {
      haptic(60)
      setMisses(m => m + 1)
      setWrong(i)
      setTimeout(() => setWrong(null), 450)
    }
  }

  const cell = 'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors'
  return (
    <div className="mt-5" onClick={e => e.stopPropagation()}>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
        Tap a term, then its match{misses > 0 && <> · <span className="text-red-500 dark:text-red-400">{misses} miss{misses !== 1 ? 'es' : ''}</span></>}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {pairs.map((p, i) => (
            <button
              key={i}
              disabled={matched.has(i)}
              onClick={() => setActiveLeft(activeLeft === i ? null : i)}
              className={`${cell} ${
                matched.has(i) ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : activeLeft === i ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/30'
                : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <ContentRenderer text={p.left} readOnly />
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {rightOrder.map(i => (
            <button
              key={i}
              disabled={matched.has(i)}
              onClick={() => pickRight(i)}
              className={`${cell} ${
                matched.has(i) ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : wrong === i ? 'border-red-400 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : activeLeft === null ? 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <ContentRenderer text={pairs[i].right} readOnly />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Read-only list of a matching card's pairs (card backs and previews)
export function MatchingPairsList({ pairs }: { pairs: MatchPair[] }) {
  return (
    <div className="space-y-1.5">
      {pairs.map((p, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
          <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-200"><ContentRenderer text={p.left} readOnly /></div>
          <span className="text-gray-300 dark:text-gray-600">↔</span>
          <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-200"><ContentRenderer text={p.right} readOnly /></div>
        </div>
      ))}
    </div>
  )
}
