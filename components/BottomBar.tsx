import type { ReactNode } from 'react'

// Action buttons pinned to the bottom of the screen, where thumbs reach on a phone and where they
// don't move when the content above changes height. Pair with <BottomBarSpacer /> at the end of the
// page so the last content can scroll clear of the bar.
export function BottomBar({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-800 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="max-w-lg mx-auto px-4 py-3">{children}</div>
    </div>
  )
}

// Always rendered at a fixed height, even when the bar is empty, so the page never shifts
export function BottomBarSpacer() {
  return <div className="h-28" aria-hidden />
}
