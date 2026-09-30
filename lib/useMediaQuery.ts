'use client'

import { useEffect, useState } from 'react'

// Tailwind's lg breakpoint: the desktop layout (sidebar, grids)
export const DESKTOP_QUERY = '(min-width: 1024px)'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
