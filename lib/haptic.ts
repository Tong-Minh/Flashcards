let _label: HTMLLabelElement | null = null

export function initHaptic(label: HTMLLabelElement) {
  _label = label
}

export function haptic(ms = 20) {
  if (typeof navigator === 'undefined') return
  if (typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(ms) } catch {}
    return
  }
  // iOS 18+ fallback: label.click() toggles the hidden switch input, firing a light haptic
  if (_label) {
    try { _label.click() } catch {}
  }
}

// True right after the user drag-selected text, so a tap handler (card flip) can ignore that click
export function hasTextSelection(): boolean {
  if (typeof window === 'undefined') return false
  const sel = window.getSelection()
  return !!sel && !sel.isCollapsed && sel.toString().trim().length > 0
}
