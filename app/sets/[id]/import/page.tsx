'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import type { CardType } from '@/lib/types'

interface ParsedCard {
  question: string
  answer: string
  options: string[] | null
  type: CardType
}

function parseCards(text: string): ParsedCard[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const lines = trimmed.split('\n')

  // Tab-separated: detect by presence of tab in first non-empty line
  const firstLine = lines.find((l) => l.trim())
  if (firstLine?.includes('\t')) {
    return lines
      .filter((l) => l.trim() && l.includes('\t'))
      .map((line) => {
        const parts = line.split('\t').map((p) => p.trim())
        if (parts.length >= 4) {
          // MC: question | correct answer | option C | option D (optionally E)
          const question = parts[0]
          const correctAnswer = parts[1]
          const extras = parts.slice(2, 5)
          const allOptions = [correctAnswer, ...extras].sort(() => Math.random() - 0.5)
          return { question, answer: correctAnswer, options: allOptions, type: 'multiple_choice' as CardType }
        }
        return {
          question: parts[0],
          answer: parts[1] ?? '',
          options: null,
          type: 'open_ended' as CardType,
        }
      })
      .filter((c) => c.question && c.answer)
  }

  // Blank-line separated pairs
  const groups: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (t === '') {
      if (current.length) { groups.push(current); current = [] }
    } else {
      current.push(t)
    }
  }
  if (current.length) groups.push(current)

  return groups
    .filter((g) => g.length >= 2)
    .map((g) => ({
      question: g[0],
      answer: g.slice(1).join('\n'),
      options: null,
      type: 'open_ended' as CardType,
    }))
}

export default function ImportCards() {
  const { id: setId } = useParams<{ id: string }>()
  const router = useRouter()

  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const preview = parseCards(text)

  async function handleImport() {
    if (preview.length === 0) return setError('No valid cards detected. Check the format.')
    setError('')
    setImporting(true)

    const rows = preview.map((c) => ({
      set_id: setId,
      question: c.question,
      answer: c.answer,
      options: c.options,
      type: c.type,
    }))

    const { error: err } = await supabase.from('flashcards').insert(rows)
    if (err) {
      setError('Import failed. Please try again.')
      setImporting(false)
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
        <h1 className="text-2xl font-bold text-gray-900">Import Cards</h1>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-5 flex items-center justify-between">
        <p className="text-sm text-indigo-700">Need help with the format?</p>
        <Link
          href="/import-format"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          View instructions →
        </Link>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Paste your cards here
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={`What is the capital of France?\nParis\n\nWhat is 2 + 2?\n4`}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm resize-none"
        />
      </div>

      {/* Preview */}
      {text.trim() && (
        <div className="mb-5">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Preview — {preview.length} card{preview.length !== 1 ? 's' : ''} detected
          </p>
          {preview.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {preview.slice(0, 10).map((card, i) => (
                <div key={i} className="bg-white rounded-lg px-3 py-2.5 border border-gray-100 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 font-medium">
                      {card.type === 'multiple_choice' ? 'MC' : 'OE'}
                    </span>
                    <span className="text-gray-900 font-medium line-clamp-1">{card.question}</span>
                  </div>
                  <p className="text-gray-500 line-clamp-1 text-xs pl-7">{card.answer}</p>
                </div>
              ))}
              {preview.length > 10 && (
                <p className="text-xs text-gray-400 text-center py-1">
                  +{preview.length - 10} more cards
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
              No cards detected. Check the format.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          {error}
        </p>
      )}

      <button
        onClick={handleImport}
        disabled={importing || preview.length === 0}
        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {importing ? 'Importing...' : `Import ${preview.length > 0 ? preview.length : ''} Card${preview.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}
