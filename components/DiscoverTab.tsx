'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { FlashcardSet, Profile } from '@/lib/types'

interface PublicSet extends FlashcardSet {
  owner: Profile | null
  cardCount: number
}

export default function DiscoverTab({ currentUser }: { currentUser: User }) {
  const [sets,    setSets]    = useState<PublicSet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: rawSets } = await supabase
      .from('sets')
      .select('*')
      .eq('is_public', true)
      .neq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!rawSets || rawSets.length === 0) { setSets([]); setLoading(false); return }

    const ownerIds = [...new Set(rawSets.map((s: FlashcardSet) => s.user_id).filter(Boolean))]
    const setIds   = rawSets.map((s: FlashcardSet) => s.id)

    const [profilesRes, cardsRes] = await Promise.all([
      supabase.from('profiles').select('*').in('id', ownerIds),
      supabase.from('flashcards').select('id, set_id').in('set_id', setIds),
    ])

    const profileMap = Object.fromEntries(
      ((profilesRes.data ?? []) as Profile[]).map(p => [p.id, p])
    )
    const cardCounts: Record<string, number> = {}
    for (const c of (cardsRes.data ?? [])) {
      cardCounts[c.set_id] = (cardCounts[c.set_id] ?? 0) + 1
    }

    setSets(rawSets.map((s: FlashcardSet) => ({
      ...s,
      owner: s.user_id ? (profileMap[s.user_id] ?? null) : null,
      cardCount: cardCounts[s.id] ?? 0,
    })))
    setLoading(false)
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-16 text-sm">Loading…</div>
  }

  if (sets.length === 0) {
    return (
      <div className="text-center text-gray-400 py-16">
        <p className="text-3xl mb-3">🌐</p>
        <p className="font-medium text-gray-500 mb-1">Nothing here yet</p>
        <p className="text-sm">Be the first to make a set public!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sets.map(set => (
        <Link
          key={set.id}
          href={`/sets/${set.id}`}
          className="block bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 hover:border-indigo-200 transition-colors"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-base leading-snug">{set.name}</p>
              {set.description && (
                <p className="text-sm text-gray-400 mt-0.5 line-clamp-1">{set.description}</p>
              )}
            </div>
            <span className="flex-shrink-0 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1 font-medium">
              {set.cardCount} card{set.cardCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {set.owner?.avatar_url ? (
              <img src={set.owner.avatar_url} alt="" className="w-5 h-5 rounded-full" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold">
                {(set.owner?.display_name ?? '?')[0].toUpperCase()}
              </div>
            )}
            <p className="text-xs text-gray-400">{set.owner?.display_name ?? 'Unknown'}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}
