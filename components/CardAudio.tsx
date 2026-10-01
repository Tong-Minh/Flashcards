'use client'

import { useEffect, useState } from 'react'
import { Pause, Play, VolumeX } from 'lucide-react'
import { IS_DESKTOP } from '@/lib/platform'
import { playClips, stopAudio, subscribe } from '@/lib/audio'

// An audio clip in a card (a markup line "[sound](audio/<file>)"). Audio lives in the desktop
// app's library folder, so the web app shows a placeholder. The button stops clicks from reaching
// the card, so playing doesn't flip it.
export function CardAudio({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false)
  const [problem, setProblem] = useState<'missing' | 'format' | null>(null)

  useEffect(() => (IS_DESKTOP ? subscribe(now => setPlaying(now === src)) : undefined), [src])

  if (!IS_DESKTOP || problem) {
    return (
      <span className="card-audio my-1.5 flex items-center gap-2 w-fit max-w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
        <VolumeX size={14} className="flex-shrink-0" />
        {!IS_DESKTOP ? 'Audio (desktop app only)' : problem === 'missing' ? 'Audio not found in this library' : 'This audio format can’t play here'}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        if (playing) { stopAudio(); return }
        playClips([src]).catch((err: Error) => setProblem(err.message === 'missing' ? 'missing' : 'format'))
      }}
      className="card-audio my-1.5 flex items-center gap-2 rounded-full border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 pl-2 pr-3.5 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
      aria-label={playing ? 'Stop audio' : 'Play audio'}
    >
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white">
        {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
      </span>
      {playing ? 'Playing…' : 'Play'}
    </button>
  )
}
