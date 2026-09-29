'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Profile, FriendRequest, LeaderboardEntry, FlashcardSet } from '@/lib/types'

interface FriendWithSets {
  profile: Profile
  sets: FlashcardSet[]
}

interface PendingRequest extends FriendRequest {
  from_profile: Profile
}

export default function FriendsTab({ currentUser }: { currentUser: User }) {
  const [leaderboard,  setLeaderboard]  = useState<LeaderboardEntry[]>([])
  const [friends,      setFriends]      = useState<FriendWithSets[]>([])
  const [pending,      setPending]      = useState<PendingRequest[]>([])
  const [loading,      setLoading]      = useState(true)

  const [searchQuery,  setSearchQuery]  = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [searching,    setSearching]    = useState(false)
  const [sentIds,      setSentIds]      = useState<Set<string>>(new Set())
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [lbRes, frRes, pendingRes] = await Promise.all([
      supabase.rpc('get_friends_leaderboard'),
      supabase
        .from('friend_requests')
        .select('*')
        .eq('status', 'accepted'),
      supabase
        .from('friend_requests')
        .select('*')
        .eq('to_user_id', currentUser.id)
        .eq('status', 'pending'),
    ])

    const lb = (lbRes.data ?? []) as LeaderboardEntry[]
    setLeaderboard(lb)

    // For each pending request, fetch the sender's profile
    const pendingList = pendingRes.data ?? []
    if (pendingList.length > 0) {
      const senderIds = pendingList.map((r: FriendRequest) => r.from_user_id)
      const { data: senderProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', senderIds)
      const profileMap = Object.fromEntries((senderProfiles ?? []).map((p: Profile) => [p.id, p]))
      setPending(pendingList.map((r: FriendRequest) => ({ ...r, from_profile: profileMap[r.from_user_id] })))
    } else {
      setPending([])
    }

    // Build friends list with their public sets
    const accepted = frRes.data ?? []
    const friendIds = accepted.map((r: FriendRequest) =>
      r.from_user_id === currentUser.id ? r.to_user_id : r.from_user_id
    )

    if (friendIds.length > 0) {
      const [profilesRes, setsRes] = await Promise.all([
        supabase.from('profiles').select('*').in('id', friendIds),
        supabase.from('sets').select('*').in('user_id', friendIds).eq('is_public', true)
          .order('created_at', { ascending: false }),
      ])
      const profiles = (profilesRes.data ?? []) as Profile[]
      const sets = (setsRes.data ?? []) as FlashcardSet[]
      const setsByUser: Record<string, FlashcardSet[]> = {}
      for (const s of sets) {
        if (s.user_id) {
          setsByUser[s.user_id] = setsByUser[s.user_id] ?? []
          setsByUser[s.user_id].push(s)
        }
      }
      setFriends(profiles.map(p => ({ profile: p, sets: setsByUser[p.id] ?? [] })))
    } else {
      setFriends([])
    }

    setLoading(false)
  }

  async function acceptRequest(requestId: string) {
    await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId)
    setPending(p => p.filter(r => r.id !== requestId))
    loadAll()
  }

  async function rejectRequest(requestId: string) {
    await supabase.from('friend_requests').update({ status: 'rejected' }).eq('id', requestId)
    setPending(p => p.filter(r => r.id !== requestId))
  }

  function onSearchChange(q: string) {
    setSearchQuery(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(() => doSearch(q.trim()), 400)
  }

  async function doSearch(q: string) {
    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('display_name', `%${q}%`)
      .neq('id', currentUser.id)
      .limit(8)
    setSearchResults((data ?? []) as Profile[])
    setSearching(false)
  }

  async function sendRequest(toUserId: string) {
    const { error } = await supabase.from('friend_requests').insert({
      from_user_id: currentUser.id,
      to_user_id: toUserId,
    })
    if (!error) setSentIds(s => new Set([...s, toUserId]))
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-16 text-sm">Loading…</div>
  }

  return (
    <div className="space-y-6">

      {/* ── Leaderboard ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">This Week</h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Add friends to start competing!</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, i) => (
              <div
                key={entry.user_id}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${
                  entry.is_me
                    ? 'bg-indigo-50 border-indigo-200'
                    : 'bg-white border-gray-100'
                }`}
              >
                <span className={`w-6 text-sm font-bold ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-300'}`}>
                  {i + 1}
                </span>
                {entry.avatar_url ? (
                  <img src={entry.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                    {(entry.display_name ?? '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {entry.is_me ? 'You' : (entry.display_name ?? 'Unknown')}
                  </p>
                  <p className="text-xs text-gray-400">{entry.sessions_week} session{entry.sessions_week !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{entry.cards_studied_week}</p>
                  <p className="text-xs text-gray-400">cards</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Pending requests ───────────────────────────────────────────── */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Friend Requests</h2>
          <div className="space-y-2">
            {pending.map(req => (
              <div key={req.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3">
                {req.from_profile?.avatar_url ? (
                  <img src={req.from_profile.avatar_url} alt="" className="w-9 h-9 rounded-full" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-bold">
                    {(req.from_profile?.display_name ?? '?')[0].toUpperCase()}
                  </div>
                )}
                <p className="flex-1 text-sm font-medium text-gray-900">{req.from_profile?.display_name ?? 'Unknown'}</p>
                <div className="flex gap-2">
                  <button onClick={() => rejectRequest(req.id)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
                    Ignore
                  </button>
                  <button
                    onClick={() => acceptRequest(req.id)}
                    className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Add friend ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Friend</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search by name…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 bg-white"
        />
        {searching && <p className="text-xs text-gray-400 mt-2 px-1">Searching…</p>}
        {searchResults.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {searchResults.map(profile => {
              const alreadyFriend = friends.some(f => f.profile.id === profile.id)
              const sent = sentIds.has(profile.id)
              return (
                <div key={profile.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold">
                      {(profile.display_name ?? '?')[0].toUpperCase()}
                    </div>
                  )}
                  <p className="flex-1 text-sm font-medium text-gray-900">{profile.display_name ?? 'Unknown'}</p>
                  {alreadyFriend ? (
                    <span className="text-xs text-gray-400">Friends</span>
                  ) : sent ? (
                    <span className="text-xs text-gray-400">Sent</span>
                  ) : (
                    <button
                      onClick={() => sendRequest(profile.id)}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      Add
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Friends' sets ──────────────────────────────────────────────── */}
      {friends.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Friends' Sets</h2>
          <div className="space-y-4">
            {friends.map(({ profile, sets }) => (
              <div key={profile.id}>
                <div className="flex items-center gap-2 mb-2">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold">
                      {(profile.display_name ?? '?')[0].toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm font-semibold text-gray-700">{profile.display_name}</p>
                </div>
                {sets.length === 0 ? (
                  <p className="text-xs text-gray-400 pl-8">No public sets</p>
                ) : (
                  <div className="space-y-2 pl-2">
                    {sets.map(set => (
                      <Link
                        key={set.id}
                        href={`/sets/${set.id}`}
                        className="block bg-white border border-gray-100 rounded-2xl px-4 py-3 hover:border-indigo-200 transition-colors"
                      >
                        <p className="text-sm font-semibold text-gray-900">{set.name}</p>
                        {set.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{set.description}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {friends.length === 0 && !loading && (
        <p className="text-center text-sm text-gray-400 py-4">Add friends to see their public sets here.</p>
      )}
    </div>
  )
}
