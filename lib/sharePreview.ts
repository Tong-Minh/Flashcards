// Server-only helpers for link previews (Open Graph metadata + image) of shared sets and collections.
// Link unfurlers (iMessage, Discord, Slack…) don't log in or run JS, so this goes through the
// share_preview RPC, which only returns display fields for public items.

import type { Metadata } from 'next'
import { headers } from 'next/headers'

export type ShareKind = 'set' | 'collection'

export interface SharePreview {
  name: string
  description: string | null
  icon: string | null
  color: string | null
  item_count: number
  owner_name: string | null
}

export async function getSharePreview(kind: ShareKind, id: string): Promise<SharePreview | null> {
  // Ids come from the URL; skip the request for anything that isn't a uuid
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/share_preview`, {
      method: 'POST',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kind, item_id: id }),
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const rows = (await res.json()) as SharePreview[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

export function countLabel(kind: ShareKind, n: number) {
  return kind === 'set' ? `${n} card${n !== 1 ? 's' : ''}` : `${n} set${n !== 1 ? 's' : ''}`
}

export async function shareMetadata(kind: ShareKind, id: string): Promise<Metadata> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const metadataBase = new URL(`${proto}://${host}`)

  const preview = await getSharePreview(kind, id)
  if (!preview) return { metadataBase }

  const summary = [countLabel(kind, preview.item_count), preview.owner_name && `by ${preview.owner_name}`]
    .filter(Boolean).join(' · ')
  const description = preview.description ? `${preview.description} — ${summary}` : `Flashcard ${kind} · ${summary}`
  return {
    metadataBase,
    title: `${preview.name} · Flashcards`,
    description,
    openGraph: { title: preview.name, description, type: 'website', siteName: 'Flashcards' },
    twitter: { card: 'summary_large_image', title: preview.name, description },
  }
}
