// Card audio playback (desktop app). One clip at a time, like Anki: playing something stops what's
// playing. The ▶ buttons (CardAudio) and the study page's autoplay both go through here, and
// buttons follow along through subscribe().
import { store } from '@/lib/store'

let player: HTMLAudioElement | null = null
let run = 0
let playing: string | null = null
const listeners = new Set<(src: string | null) => void>()

function setPlaying(src: string | null) {
  playing = src
  for (const fn of listeners) fn(src)
}

export function subscribe(fn: (src: string | null) => void): () => void {
  listeners.add(fn)
  fn(playing)
  return () => { listeners.delete(fn) }
}

export function stopAudio() {
  run++
  player?.pause()
  player = null
  setPlaying(null)
}

// Plays the clips one after another. Resolves when done or stopped; rejects if a clip can't be
// played (missing, or a format this system can't play, like .ogg in the Mac app).
export async function playClips(srcs: string[]): Promise<void> {
  stopAudio()
  const mine = run
  for (const src of srcs) {
    const url = await store.mediaUrl(src)
    if (mine !== run) return
    if (!url) throw new Error('missing')
    const audio = new Audio(url)
    player = audio
    setPlaying(src)
    try {
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve()
        audio.onerror = () => reject(new Error('format'))
        audio.onpause = () => { if (!audio.ended) resolve() }
        audio.play().catch(reject)
      })
    } finally {
      if (mine === run) setPlaying(null)
    }
    if (mine !== run) return
  }
}
