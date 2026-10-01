// External links (a set's or collection's source)
import { inTauri } from '@/lib/platform'

// A typed link, cleaned up: https:// added when there's no scheme. Null for anything that isn't an
// http(s) link (so a "javascript:" link can't be saved).
export function normalizeUrl(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function hostOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return url }
}

// Opens in the system browser from the desktop app, or a new tab on the web
export async function openExternal(url: string) {
  if (inTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
