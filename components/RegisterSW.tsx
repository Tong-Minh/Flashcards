'use client'

import { useEffect } from 'react'
import { IS_DESKTOP } from '@/lib/platform'

export function RegisterSW() {
  useEffect(() => {
    // The desktop app loads from disk and needs no offline cache
    if (!IS_DESKTOP && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
