'use client'

import { useEffect, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { haptic } from '@/lib/haptic'

const EDGE_PX       = 16   // touches starting this close to a side edge are blocked (iOS back/forward swipe)
const PULL_TRIGGER  = 70   // pull distance (after resistance) that reloads on release
const PULL_MAX      = 110
const RESISTANCE    = 0.5

// Only for the installed home-screen app; a normal browser tab keeps its own gestures.
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

// Things a vertical drag shouldn't turn into a refresh: drag handles, the View-mode scrubber, text
// entry, and anything marked data-no-pull.
function blocksPull(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null
  return !!el?.closest('.touch-none, input, textarea, select, [contenteditable="true"], [data-no-pull]')
}

// App-like touch behavior for the installed web app:
// - Swiping in from the left/right edge doesn't navigate back/forward (iOS standalone does by default).
// - Pull down at the top of the page to reload (standalone apps get no browser pull-to-refresh).
export function StandaloneGestures() {
  const [enabled,    setEnabled]    = useState(false)
  const [pull,       setPull]       = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const start   = useRef<{ x: number; y: number } | null>(null)
  const pulling = useRef(false)
  const pullRef = useRef(0)

  useEffect(() => { setEnabled(isStandalone()) }, [])

  useEffect(() => {
    if (!enabled) return

    function onStart(e: TouchEvent) {
      const t = e.touches[0]
      if (!t || e.touches.length > 1) return
      // Block the edge-swipe navigation gesture. Content has a 16px side gutter, so nothing tappable lives here.
      if (t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX) {
        e.preventDefault()
        return
      }
      const modalOpen = document.body.style.overflow === 'hidden'
      start.current   = window.scrollY <= 0 && !modalOpen && !blocksPull(e.target) ? { x: t.clientX, y: t.clientY } : null
      pulling.current = false
    }

    function onMove(e: TouchEvent) {
      const t = e.touches[0]
      if (!start.current || !t) return
      const dy = t.clientY - start.current.y
      const dx = t.clientX - start.current.x
      // Decide once: a mostly-downward drag from the top becomes a pull; anything else is left alone
      if (!pulling.current) {
        if (dy > 8 && dy > Math.abs(dx) * 1.5 && window.scrollY <= 0) pulling.current = true
        else if (Math.abs(dx) > 8 || dy < -8) { start.current = null; return }
        else return
      }
      e.preventDefault()   // keep the page (and iOS rubber-banding) still while pulling
      const distance = Math.min(PULL_MAX, Math.max(0, dy * RESISTANCE))
      if (pullRef.current < PULL_TRIGGER && distance >= PULL_TRIGGER) haptic(15)
      pullRef.current = distance
      setPull(distance)
    }

    function onEnd() {
      if (pulling.current && pullRef.current >= PULL_TRIGGER) {
        setRefreshing(true)
        setPull(PULL_TRIGGER)
        // Pages render from the local cache first, so a reload is quick and picks up fresh data
        window.location.reload()
      } else {
        setPull(0)
      }
      start.current   = null
      pulling.current = false
      pullRef.current = 0
    }

    // Non-passive so preventDefault can stop the edge swipe and the page from scrolling mid-pull
    document.addEventListener('touchstart', onStart, { passive: false })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled])

  if (!enabled || (pull === 0 && !refreshing)) return null
  const ready = pull >= PULL_TRIGGER
  return (
    <div
      className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none"
      style={{ top: `calc(env(safe-area-inset-top) + ${pull - 40}px)`, transition: pulling.current ? 'none' : 'top 0.2s ease-out' }}
    >
      <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow-md border border-gray-100 dark:border-gray-700 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
        <RotateCw
          size={18}
          className={refreshing ? 'animate-spin' : ''}
          style={refreshing ? undefined : { transform: `rotate(${(pull / PULL_TRIGGER) * 270}deg)`, opacity: ready ? 1 : 0.6 }}
        />
      </div>
    </div>
  )
}
