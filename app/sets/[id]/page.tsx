'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useUser } from '@/components/AuthGuard'
import {
  cacheCards, getCachedCards, getCachedSets,
  cacheSessions, getCachedSessions,
  getSetSettings, saveSetSettings,
  resetTodayNewCount,
} from '@/lib/storage'
import { previewText } from '@/components/ContentRenderer'
import type { FlashcardSet, FlashcardWithProgress, StudySession } from '@/lib/types'

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  new:          { label: 'New',      className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'     },
  learning:     { label: 'Learning', className: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' },
  needs_review: { label: 'Review',   className: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' },
  mastered:     { label: 'Mature',   className: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'   },
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) {
    const h = date.getHours() % 12 || 12
    const m = date.getMinutes().toString().padStart(2, '0')
    const ampm = date.getHours() >= 12 ? 'pm' : 'am'
    return `Today ${h}:${m}${ampm}`
  }
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

// Compact version for narrow stat cells — omits time to avoid truncation
function compactDate(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

export default function SetDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const currentUser = useUser()

  const [set,      setSet]      = useState<FlashcardSet | null>(null)
  const [cards,    setCards]    = useState<FlashcardWithProgress[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'cards' | 'history'>('cards')
  const [forking,     setForking]     = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  // Settings sheet
  const [showSettings,      setShowSettings]      = useState(false)
  const [nameInput,         setNameInput]         = useState('')
  const [descInput,         setDescInput]         = useState('')
  const [isPublicInput,     setIsPublicInput]     = useState(true)
  const [dailyLimitInput,   setDailyLimitInput]   = useState(20)
  const nameRef = useRef<HTMLInputElement>(null)

  const isOwner = !!currentUser && !!set && set.user_id === currentUser.id

  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    const cachedCards = getCachedCards(id)
    const cachedSets  = getCachedSets()
    const cachedSet   = cachedSets.find(s => s.id === id) ?? null
    const cachedSess  = getCachedSessions(id)

    if (cachedSet || cachedCards.length > 0) {
      if (cachedSet) {
        setSet(cachedSet)
        setNameInput(cachedSet.name)
        setDescInput(cachedSet.description ?? '')
        setIsPublicInput(cachedSet.is_public ?? false)
      }
      if (cachedCards.length > 0) setCards(cachedCards)
      if (cachedSess.length  > 0) setSessions(cachedSess)
      setLoading(false)
    }

    const settings = getSetSettings(id)
    setDailyLimitInput(settings.dailyNewLimit)

    if (!navigator.onLine) { setLoading(false); return }

    const [setRes, cardsRes, sessionsRes] = await Promise.all([
      supabase.from('sets').select('*').eq('id', id).single(),
      supabase
        .from('flashcards')
        .select('*, progress:card_progress(*)')
        .eq('set_id', id)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('study_sessions')
        .select('*')
        .eq('set_id', id)
        .order('completed_at', { ascending: false }),
    ])

    if (!setRes.data) { router.push('/'); return }

    const freshCards = (cardsRes.data ?? []).map((c) => ({
      ...c,
      progress: Array.isArray(c.progress) ? (c.progress[0] ?? null) : c.progress,
    }))
    const freshSessions = sessionsRes.data ?? []

    setSet(setRes.data)
    setNameInput(setRes.data.name)
    setDescInput(setRes.data.description ?? '')
    setIsPublicInput(setRes.data.is_public ?? false)
    setCards(freshCards)
    setSessions(freshSessions)
    cacheCards(id, freshCards)
    cacheSessions(id, freshSessions)
    setLoading(false)
  }

  async function saveInfo() {
    const trimmedName = nameInput.trim()
    const trimmedDesc = descInput.trim()
    if (!trimmedName) return
    await supabase.from('sets').update({
      name: trimmedName,
      description: trimmedDesc || null,
      is_public: isPublicInput,
    }).eq('id', id)
    setSet(s => s ? { ...s, name: trimmedName, description: trimmedDesc || null, is_public: isPublicInput } : s)
    setShowSettings(false)
  }

  async function forkSet() {
    setForking(true)
    try {
      const { data, error } = await supabase.rpc('fork_set', { original_set_id: id })
      if (!error && data) router.push(`/sets/${data}`)
    } finally {
      setForking(false)
    }
  }

  function saveDailyLimit(val: number) {
    const clamped = Math.max(1, Math.min(999, val || 1))
    setDailyLimitInput(clamped)
    saveSetSettings(id, { ...getSetSettings(id), dailyNewLimit: clamped })
  }

  async function resetProgress() {
    if (!confirm('Reset all FSRS progress for this set? Cards will return to New state.')) return
    const cardIds = cards.map(c => c.id)
    if (cardIds.length > 0) {
      await supabase.from('card_progress').delete().in('card_id', cardIds)
    }
    resetTodayNewCount(id)
    const reset = cards.map(c => ({ ...c, progress: null }))
    setCards(reset)
    cacheCards(id, reset)
    setShowSettings(false)
  }

  async function deleteSet() {
    if (!confirm(`Delete "${set?.name}" and all its cards?`)) return
    await supabase.from('sets').delete().eq('id', id)
    router.push('/')
  }

  async function reorderCard(index: number, dir: 'up' | 'down') {
    const other = dir === 'up' ? index - 1 : index + 1
    if (other < 0 || other >= cards.length) return
    const newCards = [...cards]
    ;[newCards[index], newCards[other]] = [newCards[other], newCards[index]]
    setCards(newCards)
    cacheCards(id, newCards)
    await Promise.all(
      newCards.map((c, i) => supabase.from('flashcards').update({ position: i }).eq('id', c.id))
    )
  }

  if (loading && !set) {
    return <div className="max-w-lg mx-auto px-4 py-6 text-center text-gray-400 dark:text-gray-500 py-16">Loading…</div>
  }

  const mastered    = cards.filter(c => c.progress?.status === 'mastered').length
  const masteryPct  = cards.length > 0 ? Math.round((mastered / cards.length) * 100) : 0
  const now         = new Date()
  const dueToday    = cards.filter(c => {
    const p = c.progress
    if (!p || (p.fsrs_state ?? 0) === 0) return true
    return new Date(p.due ?? now) <= now
  }).length

  const lastStudied  = sessions[0]?.completed_at ?? null
  const totalSessions = sessions.length
  const avgCorrect   =
    sessions.length > 0
      ? Math.round(
          (sessions.reduce((s, x) => s + x.correct_count, 0) /
            sessions.reduce((s, x) => s + Math.max(x.cards_studied, 1), 0)) * 100
        )
      : null

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl transition-colors flex-shrink-0 mt-1">←</Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{set?.name}</h1>
            {set && !set.is_public && (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                Private
              </span>
            )}
          </div>
          {set?.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{set.description}</p>
          )}
        </div>
        {isOwner && (
          <button
            onClick={() => setShowSettings(true)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1 mt-0.5"
            aria-label="Settings"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { value: cards.length,        label: 'Cards'    },
          { value: `${masteryPct}%`,    label: 'Mature'   },
          { value: totalSessions,       label: 'Sessions' },
          { value: compactDate(lastStudied), label: 'Last'    },
        ].map(({ value, label }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-2.5 text-center shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">{value}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Accuracy banner */}
      {avgCorrect !== null && (
        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-indigo-700 dark:text-indigo-300">Avg accuracy</span>
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{avgCorrect}%</span>
        </div>
      )}

      {/* Mastery bar */}
      {cards.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
            <span>{mastered} mature</span>
            <span>{cards.length - mastered} remaining</span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${masteryPct}%` }} />
          </div>
        </div>
      )}

      {/* Study CTA */}
      <div className="flex gap-3 mb-5">
        {cards.length > 0 ? (
          <Link
            href={`/sets/${id}/study`}
            className="flex-1 block text-center bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
          >
            {dueToday > 0 ? `Study — ${dueToday} due` : 'Study'}
          </Link>
        ) : (
          <button
            disabled
            className="flex-1 text-center bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg opacity-40 cursor-not-allowed shadow-sm"
          >
            Study
          </button>
        )}
        {!isOwner && (
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              className="h-full px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shadow-sm text-xl leading-none tracking-widest"
              aria-label="More options"
            >
              •••
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-20 w-52 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 overflow-hidden">
                  <button
                    onClick={() => { setShowMoreMenu(false); forkSet() }}
                    disabled={forking}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50"
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{forking ? 'Duplicating…' : 'Duplicate set'}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Save your own copy to study &amp; edit</p>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {dueToday === 0 && cards.length > 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl text-center text-sm font-medium mb-5 -mt-3">
          All caught up — no cards due
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        {(['cards', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors capitalize ${
              tab === t
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
            }`}
          >
            {t === 'history' ? `History${sessions.length > 0 ? ` (${sessions.length})` : ''}` : 'Cards'}
          </button>
        ))}
      </div>

      {/* ── Cards tab ─────────────────────────────────────────────────────── */}
      {tab === 'cards' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {cards.length} card{cards.length !== 1 ? 's' : ''}
            </h2>
            {isOwner && (
              <div className="flex items-center gap-2">
                <Link
                  href={`/sets/${id}/import`}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium px-3 py-1.5"
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
            )}
          </div>

          {cards.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <p className="mb-1">No cards yet</p>
              <p className="text-sm">Add cards or import a list</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cards.map((card, idx) => {
                const status = card.progress?.status ?? 'new'
                const badge  = STATUS_STYLES[status]
                return (
                  <div key={card.id} className="bg-white dark:bg-gray-800 rounded-xl p-3.5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          <span className="text-gray-400 dark:text-gray-500 mr-1">{idx + 1}.</span>{previewText(card.question)}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {card.type === 'multiple_choice' ? 'MC' : card.type === 'fill_blank' ? 'FB' : 'OE'}
                          </span>
                        </div>
                      </div>
                      {isOwner && (
                        <div className="flex items-stretch gap-3 flex-shrink-0">
                          <Link
                            href={`/sets/${id}/edit/${card.id}`}
                            className="flex items-center px-2.5 text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            Edit
                          </Link>
                          <div className="flex flex-col rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden w-7">
                            <button
                              onClick={() => reorderCard(idx, 'up')}
                              disabled={idx === 0}
                              className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-20 transition-colors border-b border-gray-200 dark:border-gray-600"
                            >
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M4 1L7 6H1L4 1Z"/></svg>
                            </button>
                            <button
                              onClick={() => reorderCard(idx, 'down')}
                              disabled={idx === cards.length - 1}
                              className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-20 transition-colors"
                            >
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M4 7L1 2H7L4 7Z"/></svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                      {card.type === 'multiple_choice' && card.options ? (
                        <ul className="space-y-1">
                          {card.options.map(opt => (
                            <li
                              key={opt}
                              className={`text-xs px-2 py-1 rounded-lg ${
                                opt === card.answer
                                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              {opt === card.answer ? '✓ ' : ''}{opt}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-600 dark:text-gray-400">{previewText(card.answer)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── History tab ───────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <>
          {sessions.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <p>No sessions yet</p>
              <p className="text-sm mt-1">Complete a study session to see history</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {session.cards_studied} card{session.cards_studied !== 1 ? 's' : ''} studied
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {new Date(session.completed_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {session.cards_studied > 0
                        ? Math.round((session.correct_count / session.cards_studied) * 100)
                        : 0}%
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">correct</p>
                    {session.mastered_count > 0 && (
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">+{session.mastered_count} matured</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Settings modal ────────────────────────────────────────────────── */}
      {showSettings && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowSettings(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
            <div className="px-5 pt-5 pb-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors text-xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Rename + description */}
              <div className="mb-5 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Set name</label>
                  <input
                    ref={nameRef}
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveInfo()}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                  <textarea
                    value={descInput}
                    onChange={e => setDescInput(e.target.value)}
                    rows={2}
                    placeholder="Optional"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublicInput(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600/50 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {isPublicInput ? 'Public' : 'Private'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {isPublicInput ? 'Friends and anyone you share it with can study this' : 'Only visible to you'}
                    </p>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${isPublicInput ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPublicInput ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </button>
              </div>

              {/* FSRS — daily new cards */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Daily new cards
                </label>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
                  How many new cards to introduce per day (like Anki&apos;s new card limit)
                </p>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={dailyLimitInput}
                  onChange={e => setDailyLimitInput(Number(e.target.value))}
                  onBlur={e => saveDailyLimit(Number(e.target.value))}
                  className="w-24 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500"
                />
              </div>

              <button
                onClick={saveInfo}
                className="w-full py-2 mb-5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Save
              </button>

              <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={resetProgress}
                  className="w-full py-3 rounded-xl border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 text-sm font-semibold hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                >
                  Reset all progress
                </button>
                <button
                  onClick={deleteSet}
                  className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-100 dark:border-red-800"
                >
                  Delete set
                </button>
              </div>
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
