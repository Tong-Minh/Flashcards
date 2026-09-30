import { ICONS, ICON_COLORS, DEFAULT_SET_ICON, DEFAULT_COLLECTION_ICON } from '@/lib/icons'

const SIZES = {
  xs: { box: 'w-6 h-6 rounded-md',   icon: 14 },
  sm: { box: 'w-8 h-8 rounded-lg',   icon: 16 },
  md: { box: 'w-10 h-10 rounded-xl', icon: 20 },
  lg: { box: 'w-12 h-12 rounded-xl', icon: 24 },
}

// Colored tile with a line icon. Falls back to the set/collection default when icon/color are unset.
export function ItemIcon({ icon, color, kind = 'set', size = 'md', className = '' }: {
  icon: string | null | undefined
  color: string | null | undefined
  kind?: 'set' | 'collection'
  size?: keyof typeof SIZES
  className?: string
}) {
  const fallback = kind === 'collection' ? DEFAULT_COLLECTION_ICON : DEFAULT_SET_ICON
  const Icon  = ICONS[icon ?? ''] ?? ICONS[fallback.icon]
  const tint  = ICON_COLORS[color ?? ''] ?? ICON_COLORS[fallback.color]
  const s     = SIZES[size]
  return (
    <div className={`flex-shrink-0 flex items-center justify-center ${s.box} ${tint.tile} ${className}`}>
      <Icon size={s.icon} strokeWidth={1.8} />
    </div>
  )
}
