import type { NextConfig } from 'next'
import { readFileSync } from 'fs'

// Two builds from one codebase (NEXT_PUBLIC_TARGET):
// - web (default): the Supabase-backed site.
// - desktop: a static export loaded by the Tauri app (src-tauri). Built through scripts/desktop.mjs,
//   which swaps in desktop/overrides for the few route files that differ.
const desktop = process.env.NEXT_PUBLIC_TARGET === 'desktop'

// The app's version (package.json, which `npm version` bumps), shown with the version history
const version = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  ...(desktop && {
    output: 'export',
    trailingSlash: true,
    images: { unoptimized: true },
  }),
}

export default nextConfig
