'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Profile, FriendRequest, LeaderboardEntry, FlashcardSet } from '@/lib/types'

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
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface Friend {
  profile: Profile
  requestId: string
  sets: FlashcardSet[]
}

interface PendingRequest extends FriendRequest {
  from_profile: Profile
}

type AvatarSize = 'sm' | 'md' | 'lg'
const AVATAR_SIZES: Record<AvatarSize, string> = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-xs',
  lg: 'w-9 h-9 text-sm',
}

function Avatar({ profile, size = 'md' }: { profile: { display_name: string | null; avatar_url: string | null }; size?: AvatarSize }) {
  const cls = `${AVATAR_SIZES[size]} rounded-full flex-shrink-0 object-cover`
  if (profile.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={cls} />
  }
  return (
    <div className={`${AVATAR_SIZES[size]} rounded-full flex-shrink-0 bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold`}>
      {(profile.display_name ?? '?')[0].toUpperCase()}
    </div>
  )
}

export default function FriendsTab({ currentUser }: { currentUser: User }) {
  const [leaderboard,   setLeaderboard]   = useState<LeaderboardEntry[]>([])
  const [friends,       setFriends]       = useState<Friend[]>([])
  const [pending,       setPending]       = useState<PendingRequest[]>([])
  const [loading,       setLoading]       = useState(true)
  const [expandedIds,   setExpandedIds]   = useState<Set<string>>(new Set())

  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [searching,     setSearching]     = useState(false)
  const [sentIds,       setSentIds]       = useState<Set<string>>(new Set())
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [lbRes, frRes, pendingRes] = await Promise.all([
      supabase.rpc('get_friends_leaderboard'),
      supabase.from('friend_requests').select('*').eq('status', 'accepted'),
      supabase.from('friend_requests').select('*').eq('to_user_id', currentUser.id).eq('status', 'pending'),
    ])

    setLeaderboard((lbRes.data ?? []) as LeaderboardEntry[])

    // Pending requests — fetch sender profiles
    const pendingList = (pendingRes.data ?? []) as FriendRequest[]
    if (pendingList.length > 0) {
      const { data: senderProfiles } = await supabase
        .from('profiles').select('*').in('id', pendingList.map(r => r.from_user_id))
      const pMap = Object.fromEntries(((senderProfiles ?? []) as Profile[]).map(p => [p.id, p]))
      setPending(pendingList.map(r => ({ ...r, from_profile: pMap[r.from_user_id] })))
    } else {
      setPending([])
    }

    // Accepted friends — fetch profiles + public sets
    const accepted = (frRes.data ?? []) as FriendRequest[]
    const friendMap = accepted.map(r => ({
      requestId: r.id,
      friendId: r.from_user_id === currentUser.id ? r.to_user_id : r.from_user_id,
    }))

    if (friendMap.length > 0) {
      const friendIds = friendMap.map(m => m.friendId)
      const [profilesRes, setsRes] = await Promise.all([
        supabase.from('profiles').select('*').in('id', friendIds),
        supabase.from('sets').select('*').in('user_id', friendIds).eq('is_public', true)
          .order('created_at', { ascending: false }),
      ])
      const profiles = (profilesRes.data ?? []) as Profile[]
      const sets     = (setsRes.data ?? []) as FlashcardSet[]
      const setsByUser: Record<string, FlashcardSet[]> = {}
      for (const s of sets) {
        if (s.user_id) {
          setsByUser[s.user_id] = setsByUser[s.user_id] ?? []
          setsByUser[s.user_id].push(s)
        }
      }
      const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))
      setFriends(
        friendMap
          .filter(m => profileMap[m.friendId])
          .map(m => ({ profile: profileMap[m.friendId], requestId: m.requestId, sets: setsByUser[m.friendId] ?? [] }))
      )
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
    await supabase.from('friend_requests').delete().eq('id', requestId)
    setPending(p => p.filter(r => r.id !== requestId))
  }

  async function removeFriend(requestId: string) {
    if (!confirm('Remove this friend?')) return
    await supabase.from('friend_requests').delete().eq('id', requestId)
    setFriends(f => f.filter(fr => fr.requestId !== requestId))
    setLeaderboard(lb => lb.filter(e => friends.find(fr => fr.requestId === requestId)?.profile.id !== e.user_id))
    loadAll()
  }

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
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
      .from('profiles').select('*').ilike('display_name', `%${q}%`).neq('id', currentUser.id).limit(8)
    setSearchResults((data ?? []) as Profile[])
    setSearching(false)
  }

  async function sendRequest(toUserId: string) {
    const { error } = await supabase.from('friend_requests').insert({ from_user_id: currentUser.id, to_user_id: toUserId })
    if (!error) setSentIds(s => new Set([...s, toUserId]))
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-16 text-sm">Loading…</div>
  }

  return (
    <div className="space-y-7">

      {/* ── Leaderboard ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">This Week</h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Add friends to start competing!</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, i) => (
              <div
                key={entry.user_id}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border ${
                  entry.is_me ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100'
                }`}
              >
                <span className={`w-5 text-sm font-bold text-center ${
                  i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-300'
                }`}>
                  {i + 1}
                </span>
                <Avatar profile={entry} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {entry.is_me ? 'You' : (entry.display_name ?? 'Unknown')}
                  </p>
                  {entry.last_set_name ? (
                    <p className="text-xs text-gray-400 truncate">
                      <span className="text-gray-300">Recent: </span>{entry.last_set_name}
                    </p>
                  ) : null}
                  {entry.last_studied_at ? (
                    <p className="text-xs text-gray-400">
                      <span className="text-gray-300">Last: </span>{timeAgo(entry.last_studied_at)}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-300">No sessions yet</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900">{entry.cards_studied_week}</p>
                  <p className="text-xs text-gray-400">cards</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Friends list ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Friends {friends.length > 0 && <span className="text-gray-300">({friends.length})</span>}
        </h2>
        {friends.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No friends yet — add someone below.</p>
        ) : (
          <div className="space-y-2">
            {friends.map(({ profile, requestId, sets }) => {
              const expanded = expandedIds.has(profile.id)
              return (
                <div key={profile.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                  {/* Friend row */}
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <Avatar profile={profile} size="lg" />
                    <button
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                      onClick={() => sets.length > 0 && toggleExpanded(profile.id)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{profile.display_name ?? 'Unknown'}</p>
                        <p className="text-xs text-gray-400">
                          {sets.length === 0 ? 'No public sets' : `${sets.length} public set${sets.length !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      {sets.length > 0 && (
                        <svg
                          width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
                          viewBox="0 0 24 24"
                          className={`flex-shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => removeFriend(requestId)}
                      className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors p-1"
                      title="Remove friend"
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Expanded sets */}
                  {expanded && sets.length > 0 && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {sets.map(set => (
                        <Link
                          key={set.id}
                          href={`/sets/${set.id}`}
                          className="flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{set.name}</p>
                            {set.description && (
                              <p className="text-xs text-gray-400 truncate mt-0.5">{set.description}</p>
                            )}
                          </div>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                            className="flex-shrink-0 text-gray-300 ml-2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Pending requests ────────────────────────────────────────────── */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Friend Requests</h2>
          <div className="space-y-2">
            {pending.map(req => (
              <div key={req.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3">
                <Avatar profile={req.from_profile ?? { display_name: null, avatar_url: null }} size="lg" />
                <p className="flex-1 text-sm font-medium text-gray-900">{req.from_profile?.display_name ?? 'Unknown'}</p>
                <div className="flex gap-2">
                  <button onClick={() => rejectRequest(req.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 transition-colors">
                    Ignore
                  </button>
                  <button onClick={() => acceptRequest(req.id)}
                    className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Add friend ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Add Friend</h2>
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
                  <Avatar profile={profile} size="md" />
                  <p className="flex-1 text-sm font-medium text-gray-900">{profile.display_name ?? 'Unknown'}</p>
                  {alreadyFriend ? (
                    <span className="text-xs text-gray-400">Friends</span>
                  ) : sent ? (
                    <span className="text-xs text-gray-400">Sent</span>
                  ) : (
                    <button onClick={() => sendRequest(profile.id)}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
                      Add
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

    </div>
  )
}
