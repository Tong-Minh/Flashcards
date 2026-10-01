'use client'

import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { IS_DESKTOP } from '@/lib/platform'
import { store } from '@/lib/store'
import type { Occlusion } from '@/lib/types'

// An image occlusion card's picture with its boxes. `ord` is the box group being asked (null = all
// of them, for previews): its boxes are orange until revealed, then outlined. In hide-all mode the
// other groups stay covered (grey) the whole time; in hide-one mode they're visible.
export function OcclusionImage({ occlusion, ord, revealed }: { occlusion: Occlusion; ord: number | null; revealed: boolean }) {
  const [url,    setUrl]    = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!IS_DESKTOP) return
    let alive = true
    store.mediaUrl(occlusion.image).then(u => { if (!alive) return; if (u) setUrl(u); else setFailed(true) }, () => alive && setFailed(true))
    return () => { alive = false }
  }, [occlusion.image])

  if (!IS_DESKTOP || failed) {
    return (
      <span className="my-2 flex items-center gap-2 w-fit max-w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
        <ImageOff size={14} className="flex-shrink-0" />
        {IS_DESKTOP ? 'Image not found in this library' : 'Image occlusion (desktop app only)'}
      </span>
    )
  }
  if (!url) return <span className="block my-2 h-40 w-full rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />

  return (
    <div className="relative w-fit max-w-full mx-auto my-2 select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" draggable={false} className="block max-w-full max-h-[32rem] rounded-lg" />
      {occlusion.shapes.map((s, i) => {
        const asked = ord === null || s.ord === ord
        if (!asked && occlusion.mode === 'hide_one') return null
        const style = { left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }
        const look = asked
          ? revealed
            ? 'border-2 border-orange-500 bg-transparent'
            : 'bg-orange-400 border-2 border-orange-500 dark:bg-orange-500'
          : 'bg-gray-300 border border-gray-400 dark:bg-gray-600 dark:border-gray-500'
        return <div key={i} className={`absolute ${s.ellipse ? 'rounded-[50%]' : 'rounded-sm'} ${look}`} style={style} />
      })}
    </div>
  )
}
