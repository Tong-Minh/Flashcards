import { Suspense } from 'react'

// Desktop build only (a static export): this route is built once, for the placeholder id "_", and
// the real id travels in the query string (see lib/paths.ts and lib/useRouteIds.ts). The web build
// uses layout.web.tsx instead (link-preview metadata).
export function generateStaticParams() {
  return [{ id: '_' }]
}

// useRouteIds reads the query string, which a static export requires inside a Suspense boundary
export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>
}
