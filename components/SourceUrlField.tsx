'use client'

import { normalizeUrl } from '@/lib/links'

// The "Source link" field on set and collection forms. Check with sourceUrlError() before saving,
// and save normalizeUrl(value).
export function SourceUrlField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        Source link <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
      </label>
      <input
        type="text"
        inputMode="url"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Where it came from, e.g. ankiweb.net/shared/info/…"
        className={`w-full border rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 outline-none focus:border-indigo-500 ${
          error ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
        }`}
      />
      {error
        ? <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>
        : <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Shown as a link icon by the title.</p>}
    </div>
  )
}

export function sourceUrlError(value: string): string | null {
  return value.trim() && !normalizeUrl(value) ? 'That doesn’t look like a web link.' : null
}
