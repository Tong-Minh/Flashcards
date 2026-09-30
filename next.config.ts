import type { NextConfig } from 'next'

// Two builds from one codebase (NEXT_PUBLIC_TARGET):
// - web (default): the Supabase-backed site.
// - desktop: a static export loaded by the Tauri app (src-tauri). Built through scripts/desktop.mjs,
//   which swaps in desktop/overrides for the few route files that differ.
const desktop = process.env.NEXT_PUBLIC_TARGET === 'desktop'

const nextConfig: NextConfig = desktop
  ? {
      output: 'export',
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {}

export default nextConfig
