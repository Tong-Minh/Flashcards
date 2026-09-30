'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { IS_DESKTOP } from '@/lib/platform'

// Shares a set or collection link through the native share sheet (or copies it). Recipients can
// only open public items, so a private one is made public first, with the owner's confirmation.
export function ShareButton({ kind, id, name, isPublic, isOwner, privateSetCount = 0, onMadePublic }: {
  kind: 'set' | 'collection'
  id: string
  name: string
  isPublic: boolean
  isOwner: boolean
  // Collections only: sets inside that stay hidden from people you share with
  privateSetCount?: number
  onMadePublic?: () => void
}) {
  // Sharing needs the web app's server; IS_DESKTOP is a build-time constant
  if (IS_DESKTOP) return null
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [copied, setCopied] = useState(false)

  async function share() {
    if (!isPublic) {
      if (!isOwner) return
      if (!confirm(`"${name}" is private. Make it public so people you send it to can open it?`)) return
      const table = kind === 'set' ? 'sets' : 'collections'
      const { error } = await supabase.from(table).update({ is_public: true }).eq('id', id)
      if (error) { alert('Could not make it public. Please try again.'); return }
      onMadePublic?.()
    }
    if (kind === 'collection' && privateSetCount > 0) {
      alert(`${privateSetCount} private set${privateSetCount !== 1 ? 's' : ''} in this collection won't be visible to others. Make them public from each set's settings to include them.`)
    }

    const url = `${window.location.origin}/${kind === 'set' ? 'sets' : 'collections'}/${id}`
    // Only title + url: extra text makes some messaging apps show it instead of the link preview
    if (navigator.share) {
      try { await navigator.share({ title: name, url }); return } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy this link:', url)
    }
  }

  return (
    <button
      onClick={share}
      className="relative flex-shrink-0 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1"
      aria-label="Share"
      title="Share"
    >
      <Share2 size={20} strokeWidth={1.8} />
      {copied && (
        <span className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-2 py-1 rounded-lg shadow">
          Link copied
        </span>
      )}
    </button>
  )
}
