'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { BlockEditor } from '@/components/BlockEditor'
import { MAX_CARDS_PER_SET } from '@/lib/fetchAll'
import type { CardType } from '@/lib/types'
import { TYPE_LABELS } from '@/lib/cardTypes'

export default function CreateCard() {
  const { id: setId } = useParams<{ id: string }>()
  const router = useRouter()
  const [type, setType] = useState<CardType>('open_ended')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [correctIndex, setCorrectIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!question.trim()) return setError('Please enter a question.')
    if (type === 'fill_blank') {
      if (!question.includes('___')) return setError('Question must contain ___ to mark the blank.')
      if (!answer.trim()) return setError('Please enter the answer for the blank.')
    }
    if (type === 'open_ended' && !answer.trim()) return setError('Please enter an answer.')
    if (type === 'multiple_choice') {
      if (options.some((o) => !o.trim())) return setError('Please fill in all four options.')
      if (correctIndex === null) return setError('Please select the correct answer.')
    }

    setSaving(true)

    const { count } = await supabase
      .from('flashcards')
      .select('id', { count: 'exact', head: true })
      .eq('set_id', setId)
    if ((count ?? 0) >= MAX_CARDS_PER_SET) {
      setError(`This set already has the maximum of ${MAX_CARDS_PER_SET.toLocaleString()} cards.`)
      setSaving(false)
      return
    }

    const cardAnswer =
      type === 'multiple_choice' ? options[correctIndex!].trim() : answer.trim()
    const cardOptions = type === 'multiple_choice' ? options.map((o) => o.trim()) : null

    const { error: err } = await supabase.from('flashcards').insert({
      set_id: setId,
      question: question.trim(),
      type,
      answer: cardAnswer,
      options: cardOptions,
    })

    if (err) {
      setError('Failed to save. Please try again.')
      setSaving(false)
      return
    }

    router.push(`/sets/${setId}`)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/sets/${setId}`} className="text-gray-400 hover:text-gray-600 text-xl transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">New Card</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {(['open_ended', 'multiple_choice', 'fill_blank'] as CardType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-3 text-xs font-semibold transition-colors ${
                type === t ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {type === 'fill_blank' ? 'Sentence (use ___ for the blank)' : 'Question'}
          </label>
          <BlockEditor
            value={question}
            onChange={setQuestion}
            rows={3}
            placeholder={
              type === 'fill_blank'
                ? 'The capital of France is ___'
                : 'What is the capital of France?'
            }
          />
        </div>

        {(type === 'open_ended' || type === 'fill_blank') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {type === 'fill_blank' ? 'Answer (fills the blank)' : 'Answer'}
            </label>
            <BlockEditor
              value={answer}
              onChange={setAnswer}
              rows={type === 'fill_blank' ? 1 : 3}
              placeholder={type === 'fill_blank' ? '' : 'Paris'}
              hideHint
            />
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
                        : 'border-gray-300 hover:border-gray-400'
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
                    onChange={(val) => updateOption(i, val)}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="flex-1 min-w-0"
                    hideHint
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Card'}
        </button>
      </form>
    </div>
  )
}
