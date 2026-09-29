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
        const q = parts[0]
        return {
          question: q,
          answer: parts[1] ?? '',
          options: null,
          type: (q.includes('___') ? 'fill_blank' : 'open_ended') as CardType,
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
    .map((g) => {
      const q = g[0]
      return {
        question: q,
        answer: g.slice(1).join('\n'),
        options: null,
        type: (q.includes('___') ? 'fill_blank' : 'open_ended') as CardType,
      }
    })
}

const AI_PROMPT = `You are creating flashcards for a study set on: [REPLACE WITH YOUR TOPIC]

Instructions:
- Generate 25–40 cards covering the most important concepts, definitions, facts, and relationships
- Base all content on accurate, real-world information from credible sources (textbooks, peer-reviewed research, official documentation, encyclopedias, authoritative references)
- Include a mix of card types: open-ended recall, fill-in-the-blank (use ___ in the question), and multiple choice

Output ONLY the raw card data — one card per line, tab-separated. No headers, numbering, labels, or extra text of any kind.

Formats (use a real tab character between each column):
- Open-ended:      Question [TAB] Answer
- Fill-in-blank:   Sentence with ___ in it [TAB] Missing word or phrase
- Multiple choice: Question [TAB] Correct answer [TAB] Wrong option [TAB] Wrong option [TAB] Wrong option

Example output:
What is the powerhouse of the cell?	Mitochondria
The ___ model describes DNA as a double helix.	Watson-Crick
What type of bond holds the two DNA strands together?	Hydrogen bonds	Covalent bonds	Ionic bonds	Peptide bonds`

export default function ImportCards() {
  const { id: setId } = useParams<{ id: string }>()
  const router = useRouter()

  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [showAI, setShowAI] = useState(false)
  const [copied, setCopied] = useState(false)

  const preview = parseCards(text)

  async function copyPrompt() {
    await navigator.clipboard.writeText(AI_PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
        <Link href={`/sets/${setId}`} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import Cards</h1>
      </div>

      {/* Generate with AI */}
      <div className="mb-4 rounded-xl border border-violet-200 dark:border-violet-800 overflow-hidden">
        <button
          onClick={() => setShowAI(!showAI)}
          className="w-full flex items-center justify-between px-4 py-3 bg-violet-50 dark:bg-violet-950/40 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">✨</span>
            <span className="text-sm font-semibold text-violet-800 dark:text-violet-300">Generate cards with AI</span>
          </div>
          <span className="text-xs text-violet-500 dark:text-violet-400">{showAI ? '▲' : '▼'}</span>
        </button>

        {showAI && (
          <div className="px-4 pb-4 bg-violet-50 dark:bg-violet-950/40 border-t border-violet-100 dark:border-violet-800/50">
            <p className="text-xs text-violet-700 dark:text-violet-400 mt-3 mb-3 leading-relaxed">
              Use any AI assistant (Claude, ChatGPT, Gemini, etc.) to generate a full study set on any topic.
            </p>
            <ol className="text-xs text-violet-700 dark:text-violet-400 space-y-1 mb-3 list-none">
              <li>1. Copy the prompt below</li>
              <li>2. Paste it into your AI, replacing <span className="font-mono bg-violet-100 dark:bg-violet-900/60 px-1 rounded">[REPLACE WITH YOUR TOPIC]</span> with your subject</li>
              <li>3. Copy the AI&apos;s response and paste it into the text area below</li>
            </ol>
            <div className="relative">
              <pre className="bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-700 rounded-lg px-3 py-3 text-xs text-gray-700 dark:text-gray-300 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {AI_PROMPT}
              </pre>
              <button
                onClick={copyPrompt}
                className="absolute top-2 right-2 px-2.5 py-1 text-xs font-semibold rounded-md bg-violet-600 text-white hover:bg-violet-700 active:bg-violet-800 transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4 mb-5 flex items-center justify-between">
        <p className="text-sm text-indigo-700 dark:text-indigo-300">Need help with the format?</p>
        <Link
          href="/import-format"
          className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          View instructions →
        </Link>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Paste your cards here
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={`What is the capital of France?\nParis\n\nWhat is 2 + 2?\n4`}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm resize-none"
        />
      </div>

      {/* Preview */}
      {text.trim() && (
        <div className="mb-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Preview — {preview.length} card{preview.length !== 1 ? 's' : ''} detected
          </p>
          {preview.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {preview.slice(0, 10).map((card, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-lg px-3 py-2.5 border border-gray-100 dark:border-gray-700 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      {card.type === 'multiple_choice' ? 'MC' : card.type === 'fill_blank' ? 'FB' : 'OE'}
                    </span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium line-clamp-1">{card.question}</span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 line-clamp-1 text-xs pl-7">{card.answer}</p>
                </div>
              ))}
              {preview.length > 10 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-1">
                  +{preview.length - 10} more cards
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
              No cards detected. Check the format.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-red-500 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-4">
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
