'use client'

import { useRef, useState } from 'react'
import { BlockEditor } from '@/components/BlockEditor'
import { TYPE_LABELS, CARD_TYPES } from '@/lib/cardTypes'
import type { CardType, MatchPair } from '@/lib/types'

export interface CardDraft {
  type: CardType
  question: string
  answer: string
  options: string[] | null
  pairs: MatchPair[] | null
}

const MIN_PAIRS = 2
const MAX_PAIRS = 8

let rowSeq = 0
const rowId = () => `row${++rowSeq}`

// Card editor shared by the create and edit pages. Validates per type and hands back the row to save.
export function CardForm({ initial, submitLabel, onSubmit }: {
  initial?: CardDraft
  submitLabel: string
  // Returns an error message, or null on success
  onSubmit: (card: CardDraft) => Promise<string | null>
}) {
  const init = initial
  const [type,         setType]         = useState<CardType>(init?.type ?? 'open_ended')
  const [question,     setQuestion]     = useState(init?.question ?? '')
  const [answer,       setAnswer]       = useState(init && init.type !== 'multiple_choice' && init.type !== 'true_false' ? init.answer : '')
  // Multiple choice
  const [options,      setOptions]      = useState<string[]>(() => {
    const o = init?.type === 'multiple_choice' ? init.options ?? [] : []
    return o.length >= 4 ? o : [...o, '', '', '', ''].slice(0, 4)
  })
  const [correctIndex, setCorrectIndex] = useState<number | null>(() =>
    init?.type === 'multiple_choice' ? Math.max(-1, (init.options ?? []).indexOf(init.answer)) : null)
  // Typed: extra accepted answers
  const [alternates,   setAlternates]   = useState<string[]>(init?.type === 'typed' ? init.options ?? [] : [])
  const [altInput,     setAltInput]     = useState('')
  // True / false
  const [truth,        setTruth]        = useState<'True' | 'False' | null>(
    init?.type === 'true_false' ? (init.answer === 'False' ? 'False' : 'True') : null)
  // Matching
  const [pairs,        setPairs]        = useState<(MatchPair & { id: string })[]>(() => {
    const p = init?.type === 'matching' ? init.pairs ?? [] : []
    const rows = p.map(x => ({ ...x, id: rowId() }))
    while (rows.length < 3) rows.push({ left: '', right: '', id: rowId() })
    return rows
  })
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const altRef = useRef<HTMLInputElement>(null)

  function addAlternate() {
    const v = altInput.trim()
    if (v && !alternates.includes(v)) setAlternates([...alternates, v])
    setAltInput('')
  }

  function build(): CardDraft | string {
    const q = question.trim()
    switch (type) {
      case 'fill_blank':
        if (!q.includes('___')) return 'The sentence must contain ___ to mark the blank.'
        if (!answer.trim()) return 'Please enter the answer for the blank.'
        return { type, question: q, answer: answer.trim(), options: null, pairs: null }
      case 'multiple_choice':
        if (!q) return 'Please enter a question.'
        if (options.some(o => !o.trim())) return 'Please fill in all four options.'
        if (correctIndex === null || correctIndex < 0) return 'Please select the correct answer.'
        if (new Set(options.map(o => o.trim())).size !== options.length) return 'Options must be different from each other.'
        return { type, question: q, answer: options[correctIndex].trim(), options: options.map(o => o.trim()), pairs: null }
      case 'typed': {
        if (!q) return 'Please enter a question.'
        if (!answer.trim()) return 'Please enter the answer.'
        const pending = altInput.trim()
        const alts = pending && !alternates.includes(pending) ? [...alternates, pending] : alternates
        return { type, question: q, answer: answer.trim(), options: alts.length ? alts : null, pairs: null }
      }
      case 'true_false':
        if (!q) return 'Please enter a statement.'
        if (!truth) return 'Choose whether the statement is true or false.'
        return { type, question: q, answer: truth, options: null, pairs: null }
      case 'matching': {
        const filled = pairs.filter(p => p.left.trim() || p.right.trim())
        if (filled.some(p => !p.left.trim() || !p.right.trim())) return 'Each pair needs both sides filled in.'
        if (filled.length < MIN_PAIRS) return `Add at least ${MIN_PAIRS} pairs.`
        if (new Set(filled.map(p => p.left.trim())).size !== filled.length ||
            new Set(filled.map(p => p.right.trim())).size !== filled.length) return 'Each term and each match must be unique.'
        return { type, question: q, answer: '', options: null, pairs: filled.map(p => ({ left: p.left.trim(), right: p.right.trim() })) }
      }
      default:
        if (!q) return 'Please enter a question.'
        if (!answer.trim()) return 'Please enter an answer.'
        return { type, question: q, answer: answer.trim(), options: null, pairs: null }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const card = build()
    if (typeof card === 'string') { setError(card); return }
    setSaving(true)
    const err = await onSubmit(card)
    if (err) { setError(err); setSaving(false) }
  }

  const label = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-3 gap-1.5">
        {CARD_TYPES.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
              type === t
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div>
        <label className={label}>
          {type === 'fill_blank' ? 'Sentence (use ___ for the blank)'
            : type === 'true_false' ? 'Statement'
            : type === 'matching' ? <>Instructions <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span></>
            : 'Question'}
        </label>
        <BlockEditor
          value={question}
          onChange={setQuestion}
          rows={type === 'matching' ? 1 : 3}
          placeholder={
            type === 'fill_blank' ? 'The capital of France is ___'
            : type === 'true_false' ? 'The Pacific is the largest ocean.'
            : type === 'matching' ? 'Match each country to its capital'
            : 'What is the capital of France?'
          }
        />
      </div>

      {(type === 'open_ended' || type === 'fill_blank' || type === 'typed') && (
        <div>
          <label className={label}>
            {type === 'fill_blank' ? 'Answer (fills the blank)' : type === 'typed' ? 'Answer to type' : 'Answer'}
          </label>
          <BlockEditor
            value={answer}
            onChange={setAnswer}
            rows={type === 'open_ended' ? 3 : 1}
            placeholder={type === 'fill_blank' ? '' : 'Paris'}
            hideHint
          />
          {type === 'typed' && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              Checking ignores capitalization, accents, extra spaces, a leading &ldquo;a/an/the&rdquo;, and small typos.
            </p>
          )}
        </div>
      )}

      {type === 'typed' && (
        <div>
          <label className={label}>
            Also accept <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
          </label>
          <div
            onClick={() => altRef.current?.focus()}
            className="flex flex-wrap items-center gap-1.5 min-h-[46px] px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent"
          >
            {alternates.map(a => (
              <span key={a} className="flex items-center gap-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 pl-2.5 pr-1.5 py-0.5 rounded-full">
                {a}
                <button type="button" onClick={() => setAlternates(alternates.filter(x => x !== a))} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label={`Remove ${a}`}>×</button>
              </span>
            ))}
            <input
              ref={altRef}
              value={altInput}
              onChange={e => setAltInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addAlternate() }
                if (e.key === 'Backspace' && !altInput && alternates.length) setAlternates(alternates.slice(0, -1))
              }}
              onBlur={addAlternate}
              placeholder={alternates.length ? '' : 'Other answers that count as correct'}
              className="flex-1 min-w-[8rem] bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
            />
          </div>
        </div>
      )}

      {type === 'true_false' && (
        <div>
          <label className={label}>This statement is</label>
          <div className="grid grid-cols-2 gap-2">
            {(['True', 'False'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setTruth(v)}
                className={`py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                  truth === v
                    ? v === 'True'
                      ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-400'
                      : 'bg-red-50 dark:bg-red-900/30 border-red-500 text-red-600 dark:text-red-400'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {type === 'multiple_choice' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Options — tap the circle to mark correct
          </label>
          <div className="space-y-2.5">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCorrectIndex(i)}
                  className={`w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    correctIndex === i
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                  }`}
                >
                  {correctIndex === i && (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                <BlockEditor
                  singleLine
                  value={opt}
                  onChange={val => setOptions(prev => prev.map((o, j) => (j === i ? val : o)))}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="flex-1 min-w-0"
                  hideHint
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {type === 'matching' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Pairs — the right side is shuffled when studying
          </label>
          <div className="space-y-2">
            {pairs.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <BlockEditor
                  singleLine
                  value={p.left}
                  onChange={val => setPairs(prev => prev.map(x => (x.id === p.id ? { ...x, left: val } : x)))}
                  placeholder={`Term ${i + 1}`}
                  className="flex-1 min-w-0"
                  hideHint
                />
                <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">↔</span>
                <BlockEditor
                  singleLine
                  value={p.right}
                  onChange={val => setPairs(prev => prev.map(x => (x.id === p.id ? { ...x, right: val } : x)))}
                  placeholder="Match"
                  className="flex-1 min-w-0"
                  hideHint
                />
                <button
                  type="button"
                  onClick={() => setPairs(prev => prev.filter(x => x.id !== p.id))}
                  disabled={pairs.length <= MIN_PAIRS}
                  className="flex-shrink-0 w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                  aria-label="Remove pair"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {pairs.length < MAX_PAIRS && (
            <button
              type="button"
              onClick={() => setPairs(prev => [...prev, { left: '', right: '', id: rowId() }])}
              className="mt-2 text-sm font-medium text-indigo-600 dark:text-indigo-400"
            >
              + Add pair
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">{error}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'Saving...' : submitLabel}
      </button>
    </form>
  )
}
