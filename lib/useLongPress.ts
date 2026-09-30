import { useRef } from 'react'
import { haptic } from './haptic'

const HOLD_MS   = 450
const MOVE_SLOP = 10

// Press-and-hold detection for mouse and touch. The click that follows a long press is swallowed
// so the press doesn't also open a link. Spread the returned handlers onto the element.
export function useLongPress(onLongPress: () => void) {
  const timer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start    = useRef<{ x: number; y: number } | null>(null)
  const fired    = useRef(false)

  function cancel() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }

  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0) return
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = setTimeout(() => {
        fired.current = true
        timer.current = null
        haptic(30)
        onLongPress()
      }, HOLD_MS)
    },
    onPointerMove(e: React.PointerEvent) {
      if (!start.current) return
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_SLOP) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClickCapture(e: React.MouseEvent) {
      if (!fired.current) return
      fired.current = false
      e.preventDefault()
      e.stopPropagation()
    },
    // Suppress the iOS/Android link preview / context menu on hold
    onContextMenu(e: React.MouseEvent) { e.preventDefault() },
  }
}
