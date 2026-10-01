import type { NextConfig } from 'next'
import { readFileSync } from 'fs'

// Two builds from one codebase (NEXT_PUBLIC_TARGET):
// - web (default): the Supabase-backed site.
// - desktop: a static export loaded by the Tauri app (src-tauri). Built through scripts/desktop.mjs,
//   which swaps in desktop/overrides for the few route files that differ.
const desktop = process.env.NEXT_PUBLIC_TARGET === 'desktop'

// The app's version (package.json, which `npm version` bumps), shown with the version history
const version = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version

// The FSRS optimizer (lib/optimizer.ts) trains on several threads, which needs a cross-origin
// isolated page. Only /optimize gets these headers: they block cross-origin images (like Google
// profile pictures) elsewhere. The desktop app sets them for every page in tauri.conf.json.
const ISOLATED = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
]

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  ...(desktop
    ? {
        output: 'export',
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        async headers() {
          return [{ source: '/optimize', headers: ISOLATED }]
        },
      }),
}

export default nextConfig
