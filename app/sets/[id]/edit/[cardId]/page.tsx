'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { RichTextarea } from '@/components/RichTextarea'
import type { CardType } from '@/lib/types'

const TYPE_LABELS: Record<CardType, string> = {
  open_ended:      'Open Ended',
  multiple_choice: 'Multiple Choice',
  fill_blank:      'Fill in Blank',
}

export default function EditCard() {
  const { id: setId, cardId } = useParams<{ id: string; cardId: string }>()
  const router = useRouter()

  const [type, setType] = useState<CardType>('open_ended')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [correctIndex, setCorrectIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadCard() }, [cardId])

  async function loadCard() {
    const { data } = await supabase.from('flashcards').select('*').eq('id', cardId).single()
    if (!data) { router.push(`/sets/${setId}`); return }

    setType(data.type as CardType)
    setQuestion(data.question)

    if (data.type === 'multiple_choice' && data.options) {
      setOptions(data.options.length >= 4 ? data.options : [...data.options, '', '', '', ''].slice(0, 4))
      setCorrectIndex(data.options.indexOf(data.answer))
    } else {
      setAnswer(data.answer)
    }
    setLoading(false)
  }

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

    const cardAnswer =
      type === 'multiple_choice' ? options[correctIndex!].trim() : answer.trim()
    const cardOptions = type === 'multiple_choice' ? options.map((o) => o.trim()) : null

    const { error: err } = await supabase
      .from('flashcards')
      .update({ question: question.trim(), type, answer: cardAnswer, options: cardOptions })
      .eq('id', cardId)

    if (err) {
      setError('Failed to save. Please try again.')
      setSaving(false)
      return
    }

    router.push(`/sets/${setId}`)
  }

  async function handleDelete() {
    if (!confirm('Delete this card?')) return
    setDeleting(true)
    await supabase.from('flashcards').delete().eq('id', cardId)
    router.push(`/sets/${setId}`)
  }

  if (loading) {
    return <div className="max-w-lg mx-auto px-4 py-6 text-center text-gray-400">Loading...</div>
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/sets/${setId}`} className="text-gray-400 hover:text-gray-600 text-xl transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Edit Card</h1>
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
          <RichTextarea
            value={question}
            onChange={setQuestion}
            rows={3}
            placeholder={type === 'fill_blank' ? 'The capital of France is ___' : ''}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          />
        </div>

        {(type === 'open_ended' || type === 'fill_blank') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {type === 'fill_blank' ? 'Answer (fills the blank)' : 'Answer'}
            </label>
            <RichTextarea
              value={answer}
              onChange={setAnswer}
              rows={type === 'fill_blank' ? 1 : 3}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>
        )}

        {type === 'multiple_choice' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Options — tap circle to mark correct
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
                  <RichTextarea
                    value={opt}
                    onChange={(val) => updateOption(i, val)}
                    rows={1}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="flex-1 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="w-full mt-3 py-4 rounded-2xl border border-red-200 text-red-500 font-semibold text-base hover:bg-red-50 active:bg-red-100 disabled:opacity-50 transition-colors"
      >
        {deleting ? 'Deleting...' : 'Delete Card'}
      </button>
    </div>
  )
}
