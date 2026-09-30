// Server-rendered link-preview image for a shared set or collection. Kept apart from
// sharePreview.ts so the metadata layout doesn't pull in lucide's full icon table.

import { ImageResponse } from 'next/og'
import { icons as lucideIcons, type IconNode } from 'lucide'
import { ICONS, ICON_COLORS, DEFAULT_SET_ICON, DEFAULT_COLLECTION_ICON } from './icons'
import { getSharePreview, countLabel, type ShareKind } from './sharePreview'

export const OG_SIZE = { width: 1200, height: 630 }

// lucide-react components can't render here (they use context), so the SVG is built from the
// matching vanilla lucide icon data. React component displayNames are the PascalCase icon names.
function iconSvg(name: string, color: string): string {
  const node = (lucideIcons as Record<string, IconNode>)[ICONS[name]?.displayName ?? ''] ?? []
  const children = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
}

export async function shareImage(kind: ShareKind, id: string) {
  const preview  = await getSharePreview(kind, id)
  const fallback = kind === 'collection' ? DEFAULT_COLLECTION_ICON : DEFAULT_SET_ICON
  const icon  = preview?.icon && ICONS[preview.icon] ? preview.icon : fallback.icon
  const tint  = ICON_COLORS[preview?.color ?? ''] ?? ICON_COLORS[fallback.color]
  const iconSrc = `data:image/svg+xml;base64,${Buffer.from(iconSvg(icon, tint.hex)).toString('base64')}`

  const name  = preview?.name ?? 'Flashcards'
  const desc  = preview ? preview.description : 'Study smarter with flashcards'
  const meta  = preview
    ? [countLabel(kind, preview.item_count), preview.owner_name && `by ${preview.owner_name}`].filter(Boolean).join('  ·  ')
    : null

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#f9fafb', padding: 72 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <div style={{ width: 200, height: 200, borderRadius: 48, background: tint.bgHex, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={iconSrc} width={120} height={120} alt="" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 2 }}>
              {kind === 'collection' ? 'Flashcard collection' : 'Flashcard set'}
            </div>
            <div style={{ fontSize: name.length > 40 ? 56 : 68, fontWeight: 800, color: '#111827', lineHeight: 1.1, marginTop: 8, display: 'flex' }}>
              {name.length > 80 ? `${name.slice(0, 78)}…` : name}
            </div>
          </div>
        </div>
        {desc && (
          <div style={{ fontSize: 36, color: '#4b5563', marginTop: 48, lineHeight: 1.35, display: 'flex' }}>
            {desc.length > 160 ? `${desc.slice(0, 158)}…` : desc}
          </div>
        )}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 30, color: '#6b7280' }}>
          <div style={{ display: 'flex' }}>{meta ?? ''}</div>
          <div style={{ display: 'flex', fontWeight: 700, color: '#4f46e5' }}>Flashcards</div>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}
