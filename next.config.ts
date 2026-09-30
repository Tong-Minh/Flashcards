import type { NextConfig } from 'next'

// Two builds from one codebase (NEXT_PUBLIC_TARGET):
// - web (default): the Supabase-backed site. Files named *.web.tsx are included (link previews).
// - desktop: a static export loaded by the Tauri app (src-tauri). Files named *.desktop.tsx are
//   included instead; dynamic routes are built once for a placeholder id (see lib/paths.ts).
const desktop = process.env.NEXT_PUBLIC_TARGET === 'desktop'

const nextConfig: NextConfig = desktop
  ? {
      output: 'export',
      trailingSlash: true,
      images: { unoptimized: true },
      pageExtensions: ['desktop.tsx', 'desktop.ts', 'tsx', 'ts'],
    }
  : {
      pageExtensions: ['web.tsx', 'web.ts', 'tsx', 'ts'],
    }

export default nextConfig
