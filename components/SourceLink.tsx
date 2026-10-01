'use client'

import { Link2 } from 'lucide-react'
import { hostOf, openExternal } from '@/lib/links'
import { inTauri } from '@/lib/platform'

// A small link icon for where a set or collection came from. A real link on the web (new tab); the
// desktop app opens it in the system browser.
export function SourceLink({ url, className = '' }: { url: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => {
        e.stopPropagation()
        if (inTauri()) { e.preventDefault(); openExternal(url) }
      }}
      title={`Source: ${hostOf(url)}`}
      aria-label={`Source: ${hostOf(url)}`}
      className={`inline-flex items-center justify-center rounded-md p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:text-gray-500 dark:hover:text-indigo-300 dark:hover:bg-indigo-900/30 transition-colors ${className}`}
    >
      <Link2 size={16} />
    </a>
  )
}
