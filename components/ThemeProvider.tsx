'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { initHaptic } from '@/lib/haptic'

type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const inputRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLLabelElement>(null)

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    const resolved =
      stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTheme(resolved)
    document.documentElement.classList.toggle('dark', resolved === 'dark')

    // iOS 18+ haptic: set non-standard switch attribute and register the label
    if (inputRef.current) inputRef.current.setAttribute('switch', '')
    if (labelRef.current) initHaptic(labelRef.current)

    // Lock to portrait — works on Android Chrome/PWA; silently ignored on iOS
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(screen.orientation as any).lock?.('portrait').catch?.(() => {})
    } catch {}
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
      {/* Hidden switch input + label for iOS 18+ haptic feedback */}
      <input
        ref={inputRef}
        id="__haptic_trigger"
        type="checkbox"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
      />
      <label
        ref={labelRef}
        htmlFor="__haptic_trigger"
        aria-hidden="true"
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
      />
    </ThemeContext.Provider>
  )
}

export function useDarkMode() {
  return useContext(ThemeContext)
}
