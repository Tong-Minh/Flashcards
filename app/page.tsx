'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useUser } from '@/components/AuthGuard'
import { cacheSets, getCachedSets } from '@/lib/storage'
import FriendsTab from '@/components/FriendsTab'
import DiscoverTab from '@/components/DiscoverTab'
import type { FlashcardSet } from '@/lib/types'

async function signOut() {
  await supabase.auth.signOut()
}

type Tab = 'mine' | 'friends' | 'discover'

interface SetWithStats extends FlashcardSet {
  totalCards: number
  toStudy: number
  lastStudied: string | null
  totalSessions: number
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function Home() {
  const currentUser = useUser()
  const [tab,     setTab]     = useState<Tab>('mine')
  const [sets,    setSets]    = useState<SetWithStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cached = getCachedSets()
    if (cached.length > 0) {
      setSets(cached as SetWithStats[])
      setLoading(false)
    }
    loadSets()
  }, [])

  async function loadSets() {
    if (!navigator.onLine) { setLoading(false); return }
    const [setsRes, cardsRes, progressRes, sessionsRes] = await Promise.all([
      supabase.from('sets').select('*').eq('user_id', currentUser?.id ?? '').order('created_at', { ascending: false }),
      supabase.from('flashcards').select('id, set_id'),
      supabase.from('card_progress').select('card_id, status'),
      supabase
        .from('study_sessions')
        .select('set_id, completed_at')
        .order('completed_at', { ascending: false }),
    ])

    const cards    = cardsRes.data ?? []
    const progress = progressRes.data ?? []
    const sessions = sessionsRes.data ?? []

    const masteredIds = new Set(progress.filter((p) => p.status === 'mastered').map((p) => p.card_id))

    const lastStudiedBySet: Record<string, string>  = {}
    const sessionCountBySet: Record<string, number> = {}
    for (const s of sessions) {
      if (!lastStudiedBySet[s.set_id]) lastStudiedBySet[s.set_id] = s.completed_at
      sessionCountBySet[s.set_id] = (sessionCountBySet[s.set_id] ?? 0) + 1
    }

    const statsMap = cards.reduce(
      (acc, c) => {
        if (!c.set_id) return acc
        if (!acc[c.set_id]) acc[c.set_id] = { total: 0, mastered: 0 }
        acc[c.set_id].total++
        if (masteredIds.has(c.id)) acc[c.set_id].mastered++
        return acc
      },
      {} as Record<string, { total: number; mastered: number }>
    )

    const processed = (setsRes.data ?? []).map((s) => ({
      ...s,
      totalCards:    statsMap[s.id]?.total    ?? 0,
      toStudy:       (statsMap[s.id]?.total ?? 0) - (statsMap[s.id]?.mastered ?? 0),
      lastStudied:   lastStudiedBySet[s.id]   ?? null,
      totalSessions: sessionCountBySet[s.id]  ?? 0,
    }))
    setSets(processed)
    cacheSets(processed)
    setLoading(false)
  }

  const TAB_LABELS: Record<Tab, string> = {
    mine:     'My Sets',
    friends:  'Friends',
    discover: 'Discover',
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Flashcards</h1>
        <div className="flex items-center gap-2">
          {tab === 'mine' && (
            <Link
              href="/sets/new"
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
            >
              + New Set
            </Link>
          )}
          <button
            onClick={signOut}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Sign out"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-5">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              tab === t
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── My Sets ─────────────────────────────────────────────────────── */}
      {tab === 'mine' && (
        loading ? (
          <div className="text-center text-gray-400 py-16">Loading...</div>
        ) : sets.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <p className="text-4xl mb-3">📚</p>
            <p className="font-medium text-gray-500 mb-1">No sets yet</p>
            <p className="text-sm">Create a set to start studying</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sets.map((set) => (
              <div key={set.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <Link href={`/sets/${set.id}`} className="block p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-gray-900 text-base leading-snug">{set.name}</h2>
                        {set.is_public && (
                          <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100">Public</span>
                        )}
                      </div>
                      {set.description && (
                        <p className="text-sm text-gray-400 mt-0.5 line-clamp-1">{set.description}</p>
                      )}
                    </div>
                    {set.toStudy > 0 && (
                      <span className="flex-shrink-0 bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        {set.toStudy} to study
                      </span>
                    )}
                    {set.toStudy === 0 && set.totalCards > 0 && (
                      <span className="flex-shrink-0 bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        Mastered
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{set.totalCards} card{set.totalCards !== 1 ? 's' : ''}</span>
                    <span>{set.totalSessions} session{set.totalSessions !== 1 ? 's' : ''}</span>
                    <span>Last: {timeAgo(set.lastStudied)}</span>
                  </div>

                  {set.totalCards > 0 && (
                    <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-400 rounded-full transition-all"
                        style={{
                          width: `${Math.round(((set.totalCards - set.toStudy) / set.totalCards) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </Link>

                <div className="flex border-t border-gray-100">
                  <Link
                    href={`/sets/${set.id}/study`}
                    className="flex-1 text-center py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    Study
                  </Link>
                  <Link
                    href={`/sets/${set.id}`}
                    className="flex-1 text-center py-3 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Manage
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Friends ─────────────────────────────────────────────────────── */}
      {tab === 'friends' && currentUser && (
        <FriendsTab currentUser={currentUser} />
      )}

      {/* ── Discover ────────────────────────────────────────────────────── */}
      {tab === 'discover' && currentUser && (
        <DiscoverTab currentUser={currentUser} />
      )}
    </div>
  )
}
