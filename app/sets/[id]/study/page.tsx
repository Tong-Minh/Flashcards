'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import type { FlashcardWithProgress, CardStatus } from '@/lib/types'

type Rating = 'correct' | 'needs_review' | 'missed'

interface SessionCard extends FlashcardWithProgress {
  _key: number
}

export default function Study() {
  const { id: setId } = useParams<{ id: string }>()
  const router = useRouter()

  const [queue, setQueue] = useState<SessionCard[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionDone, setSessionDone] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [flipKey, setFlipKey] = useState(0)
  const [totalCards, setTotalCards] = useState(0)

  // Session stats tracked by ref so they're always current on save
  const statsRef = useRef({ cardsStudied: 0, correctCount: 0, masteredCount: 0 })
  const [displayStats, setDisplayStats] = useState({ cardsStudied: 0, correctCount: 0, masteredCount: 0 })

  useEffect(() => {
    loadSession()
  }, [setId])

  async function loadSession() {
    const { data } = await supabase
      .from('flashcards')
      .select('*, progress:card_progress(*)')
      .eq('set_id', setId)

    if (!data || data.length === 0) {
      setSessionDone(true)
      setLoading(false)
      return
    }

    const cards: FlashcardWithProgress[] = data.map((c) => ({
      ...c,
      progress: Array.isArray(c.progress) ? (c.progress[0] ?? null) : c.progress,
    }))

    const toStudy = cards.filter((c) => c.progress?.status !== 'mastered')
    if (toStudy.length === 0) {
      setSessionDone(true)
      setLoading(false)
      return
    }

    const shuffled = [...toStudy].sort(() => Math.random() - 0.5)
    setTotalCards(shuffled.length)
    setQueue(shuffled.map((c) => ({ ...c, _key: 0 })))
    setLoading(false)
  }

  async function saveSession() {
    const s = statsRef.current
    if (s.cardsStudied === 0) return
    await supabase.from('study_sessions').insert({
      set_id: setId,
      cards_studied: s.cardsStudied,
      correct_count: s.correctCount,
      mastered_count: s.masteredCount,
    })
  }

  async function handleExit() {
    if (statsRef.current.cardsStudied > 0) {
      await saveSession()
    }
    router.push(`/sets/${setId}`)
  }

  async function rate(rating: Rating) {
    const card = queue[0]
    if (!card) return

    const currentProgress = card.progress
    let newCorrectCount = currentProgress?.correct_count ?? 0
    let newStatus: CardStatus

    if (rating === 'correct') {
      newCorrectCount += 1
      newStatus = newCorrectCount >= 3 ? 'mastered' : 'learning'
    } else if (rating === 'missed') {
      newCorrectCount = 0
      newStatus = 'learning'
    } else {
      newStatus = 'needs_review'
    }

    // Update progress in DB
    if (currentProgress?.id) {
      await supabase
        .from('card_progress')
        .update({ correct_count: newCorrectCount, status: newStatus, last_reviewed: new Date().toISOString() })
        .eq('card_id', card.id)
    } else {
      await supabase.from('card_progress').insert({
        card_id: card.id,
        correct_count: newCorrectCount,
        status: newStatus,
        last_reviewed: new Date().toISOString(),
      })
    }

    // Update session stats
    const newStats = {
      cardsStudied: statsRef.current.cardsStudied + 1,
      correctCount: statsRef.current.correctCount + (rating === 'correct' ? 1 : 0),
      masteredCount: statsRef.current.masteredCount + (newStatus === 'mastered' ? 1 : 0),
    }
    statsRef.current = newStats
    setDisplayStats({ ...newStats })

    const updatedCard: SessionCard = {
      ...card,
      progress: {
        id: currentProgress?.id ?? '',
        card_id: card.id,
        correct_count: newCorrectCount,
        status: newStatus,
        last_reviewed: new Date().toISOString(),
      },
      _key: card._key + 1,
    }

    const rest = queue.slice(1)
    let newQueue: SessionCard[]

    if (rating === 'needs_review' || rating === 'missed') {
      newQueue = [...rest, updatedCard]
    } else {
      newQueue = rest
    }

    setFlipped(false)
    setSelectedOption(null)
    setFlipKey((k) => k + 1)

    if (newQueue.length === 0) {
      await saveSession()
      setSessionDone(true)
    } else {
      setQueue(newQueue)
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 text-center text-gray-400 py-16">
        Loading session...
      </div>
    )
  }

  if (sessionDone) {
    const s = displayStats
    const pct = s.cardsStudied > 0 ? Math.round((s.correctCount / s.cardsStudied) * 100) : 0
    return (
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="text-center w-full">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Session Complete!</h2>
          <p className="text-gray-500 mb-6">Nice work!</p>

          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
              <div className="text-xl font-bold text-gray-900">{s.cardsStudied}</div>
              <div className="text-xs text-gray-400">Studied</div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
              <div className="text-xl font-bold text-indigo-600">{pct}%</div>
              <div className="text-xs text-gray-400">Correct</div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
              <div className="text-xl font-bold text-green-500">{s.masteredCount}</div>
              <div className="text-xs text-gray-400">Mastered</div>
            </div>
          </div>

          <Link
            href={`/sets/${setId}`}
            className="inline-block w-full bg-indigo-600 text-white px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            Back to Set
          </Link>
        </div>
      </div>
    )
  }

  const card = queue[0]
  const done = totalCards - queue.length
  const progressPct = totalCards > 0 ? (done / totalCards) * 100 : 0
  const correctCount = card.progress?.correct_count ?? 0
  const isCorrectSelection = selectedOption !== null && selectedOption === card.answer

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handleExit}
          className="text-gray-400 hover:text-gray-600 transition-colors font-medium"
        >
          ← Exit
        </button>
        <span className="text-sm text-gray-400">{queue.length} remaining</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 rounded-full mb-4 overflow-hidden">
        <div
          className="h-2 bg-indigo-500 rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Mastery dots */}
      <div className="flex items-center gap-1.5 mb-5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i < correctCount ? 'bg-green-400' : 'bg-gray-200'
            }`}
          />
        ))}
        <span className="text-xs text-gray-400 ml-1 w-6">{correctCount}/3</span>
      </div>

      {/* Card */}
      <div
        key={flipKey}
        className="flip-in bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-5 min-h-[220px] flex flex-col"
        onClick={card.type === 'open_ended' && !flipped ? () => setFlipped(true) : undefined}
        style={{ cursor: card.type === 'open_ended' && !flipped ? 'pointer' : 'default' }}
      >
        {!flipped ? (
          <div className="flex flex-col flex-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
              {card.type === 'multiple_choice' ? 'Multiple Choice' : 'Tap to reveal answer'}
            </p>
            <p className="text-xl font-medium text-gray-900 leading-relaxed flex-1">
              {card.question}
            </p>
            {card.type === 'multiple_choice' && card.options && (
              <div className="mt-5 space-y-2">
                {card.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedOption(opt)
                      setFlipped(true)
                    }}
                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors font-medium"
                  >
                    <span className="text-gray-400 mr-2">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col flex-1">
            <p className="text-xs font-medium text-indigo-400 uppercase tracking-wide mb-3">Answer</p>

            {card.type === 'multiple_choice' && selectedOption && (
              <div
                className={`flex items-center gap-2 mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
                  isCorrectSelection ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}
              >
                {isCorrectSelection ? '✓ Correct!' : `✗ Incorrect — you picked: ${selectedOption}`}
              </div>
            )}

            <p className="text-xl font-semibold text-gray-900 leading-relaxed flex-1">
              {card.answer}
            </p>

            {card.type === 'multiple_choice' && card.options && (
              <div className="mt-4 space-y-1.5">
                {card.options.map((opt, i) => {
                  const isCorrect = opt === card.answer
                  const isSelected = opt === selectedOption
                  return (
                    <div
                      key={i}
                      className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${
                        isCorrect
                          ? 'bg-green-50 text-green-700 font-medium border border-green-200'
                          : isSelected && !isCorrect
                          ? 'bg-red-50 text-red-400 line-through border border-red-100'
                          : 'text-gray-400'
                      }`}
                    >
                      <span>{String.fromCharCode(65 + i)}.</span>
                      <span>{opt}</span>
                      {isCorrect && <span className="ml-auto">✓</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {flipped ? (
        <div className="grid grid-cols-3 gap-3 fade-in">
          <button
            onClick={() => rate('missed')}
            className="py-4 rounded-2xl bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100 active:bg-red-200 transition-colors border border-red-100"
          >
            <span className="block text-lg mb-0.5">✗</span>
            Missed
          </button>
          <button
            onClick={() => rate('needs_review')}
            className="py-4 rounded-2xl bg-yellow-50 text-yellow-700 font-semibold text-sm hover:bg-yellow-100 active:bg-yellow-200 transition-colors border border-yellow-100"
          >
            <span className="block text-lg mb-0.5">↩</span>
            Review
          </button>
          <button
            onClick={() => rate('correct')}
            className="py-4 rounded-2xl bg-green-50 text-green-600 font-semibold text-sm hover:bg-green-100 active:bg-green-200 transition-colors border border-green-100"
          >
            <span className="block text-lg mb-0.5">✓</span>
            Got it
          </button>
        </div>
      ) : (
        card.type === 'open_ended' && (
          <button
            onClick={() => setFlipped(true)}
            className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            Show Answer
          </button>
        )
      )}
    </div>
  )
}
