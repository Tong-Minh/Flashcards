'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import type { FlashcardSet, FlashcardWithProgress, StudySession } from '@/lib/types'

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-blue-100 text-blue-700' },
  learning: { label: 'Learning', className: 'bg-yellow-100 text-yellow-700' },
  needs_review: { label: 'Review', className: 'bg-orange-100 text-orange-700' },
  mastered: { label: 'Mastered', className: 'bg-green-100 text-green-700' },
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

export default function SetDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [set, setSet] = useState<FlashcardSet | null>(null)
  const [cards, setCards] = useState<FlashcardWithProgress[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAll()
  }, [id])

  async function loadAll() {
    const [setRes, cardsRes, sessionsRes] = await Promise.all([
      supabase.from('sets').select('*').eq('id', id).single(),
      supabase
        .from('flashcards')
        .select('*, progress:card_progress(*)')
        .eq('set_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('study_sessions')
        .select('*')
        .eq('set_id', id)
        .order('completed_at', { ascending: false }),
    ])

    if (!setRes.data) { router.push('/'); return }

    setSet(setRes.data)
    setNameInput(setRes.data.name)
    setCards(
      (cardsRes.data ?? []).map((c) => ({
        ...c,
        progress: Array.isArray(c.progress) ? (c.progress[0] ?? null) : c.progress,
      }))
    )
    setSessions(sessionsRes.data ?? [])
    setLoading(false)
  }

  async function saveName() {
    if (!nameInput.trim() || nameInput === set?.name) { setEditingName(false); return }
    await supabase.from('sets').update({ name: nameInput.trim() }).eq('id', id)
    setSet((s) => s ? { ...s, name: nameInput.trim() } : s)
    setEditingName(false)
  }

  async function deleteCard(cardId: string) {
    await supabase.from('flashcards').delete().eq('id', cardId)
    setCards((prev) => prev.filter((c) => c.id !== cardId))
  }

  async function deleteSet() {
    if (!confirm(`Delete "${set?.name}" and all its cards?`)) return
    await supabase.from('sets').delete().eq('id', id)
    router.push('/')
  }

  if (loading) {
    return <div className="max-w-lg mx-auto px-4 py-6 text-center text-gray-400 py-16">Loading...</div>
  }

  const mastered = cards.filter((c) => c.progress?.status === 'mastered').length
  const toStudy = cards.length - mastered
  const masteryPct = cards.length > 0 ? Math.round((mastered / cards.length) * 100) : 0

  const lastStudied = sessions[0]?.completed_at ?? null
  const totalSessions = sessions.length
  const avgCorrect =
    sessions.length > 0
      ? Math.round(
          (sessions.reduce((s, x) => s + x.correct_count, 0) /
            sessions.reduce((s, x) => s + Math.max(x.cards_studied, 1), 0)) *
            100
        )
      : null

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-xl transition-colors flex-shrink-0">
          ←
        </Link>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              ref={nameRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-indigo-500 outline-none w-full"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-2xl font-bold text-gray-900 text-left hover:text-indigo-600 transition-colors truncate block w-full"
              title="Click to rename"
            >
              {set?.name}
            </button>
          )}
        </div>
        <button
          onClick={deleteSet}
          className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors text-sm px-2 py-1"
        >
          Delete
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { value: cards.length, label: 'Cards' },
          { value: `${masteryPct}%`, label: 'Mastered' },
          { value: totalSessions, label: 'Sessions' },
          { value: timeAgo(lastStudied), label: 'Last' },
        ].map(({ value, label }) => (
          <div key={label} className="bg-white rounded-xl p-2.5 text-center shadow-sm border border-gray-100">
            <div className="text-base font-bold text-gray-900 truncate">{value}</div>
            <div className="text-xs text-gray-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Session accuracy */}
      {avgCorrect !== null && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
          <span className="text-sm text-indigo-700">Avg accuracy across all sessions</span>
          <span className="text-sm font-bold text-indigo-700">{avgCorrect}%</span>
        </div>
      )}

      {/* Mastery bar */}
      {cards.length > 0 && (
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{mastered} mastered</span>
            <span>{toStudy} remaining</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all"
              style={{ width: `${masteryPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Study CTA */}
      {toStudy > 0 ? (
        <Link
          href={`/sets/${id}/study`}
          className="block w-full text-center bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg mb-6 hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
        >
          Study Now — {toStudy} card{toStudy !== 1 ? 's' : ''}
        </Link>
      ) : cards.length > 0 ? (
        <div className="bg-green-50 border border-green-200 text-green-700 py-4 rounded-2xl text-center font-medium mb-6">
          All cards mastered!
        </div>
      ) : null}

      {/* Cards section */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Cards</h2>
        <div className="flex gap-2">
          <Link
            href={`/sets/${id}/import`}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Import
          </Link>
          <Link
            href={`/sets/${id}/create`}
            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
          >
            + Add
          </Link>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="text-center text-gray-400 py-10 bg-white rounded-2xl border border-gray-100">
          <p className="mb-1">No cards yet</p>
          <p className="text-sm">Add cards or import a list</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => {
            const status = card.progress?.status ?? 'new'
            const badge = STATUS_STYLES[status]
            return (
              <div
                key={card.id}
                className="bg-white rounded-xl p-3.5 shadow-sm border border-gray-100 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 line-clamp-1">{card.question}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {card.type === 'multiple_choice' ? 'MC' : 'OE'}
                    </span>
                    {status !== 'mastered' && (
                      <span className="text-xs text-gray-400">
                        {card.progress?.correct_count ?? 0}/3
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Link
                    href={`/sets/${id}/edit/${card.id}`}
                    className="p-1.5 text-gray-400 hover:text-indigo-500 transition-colors text-sm"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => deleteCard(card.id)}
                    className="p-1.5 text-gray-300 hover:text-red-400 transition-colors text-xl leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Session history */}
      {sessions.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-gray-900 mb-3">Session History</h2>
          <div className="space-y-2">
            {sessions.slice(0, 5).map((session) => (
              <div
                key={session.id}
                className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {session.cards_studied} card{session.cards_studied !== 1 ? 's' : ''} studied
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(session.completed_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-700">
                    {session.cards_studied > 0
                      ? Math.round((session.correct_count / session.cards_studied) * 100)
                      : 0}
                    %
                  </p>
                  <p className="text-xs text-gray-400">correct</p>
                  {session.mastered_count > 0 && (
                    <p className="text-xs text-green-600 font-medium">+{session.mastered_count} mastered</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
