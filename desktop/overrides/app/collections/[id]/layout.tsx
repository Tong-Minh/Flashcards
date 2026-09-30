import { Suspense } from 'react'

// Desktop build only (swapped in by scripts/desktop.mjs). The desktop app is a static export, so this
// route is built once for the placeholder id "_" and the real id travels in the query string (see
// lib/paths.ts and lib/useRouteIds.ts). The web build uses the regular layout with link previews.
export function generateStaticParams() {
  return [{ id: '_' }]
}

// useRouteIds reads the query string, which a static export requires inside a Suspense boundary
export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>
}
