import type { Flashcard } from '@/lib/types'

// The image and audio files cards use ("images/<file>", "audio/<file>"): in their text, and an image
// occlusion card's picture
export function mediaOf(cards: Flashcard[]): string[] {
  const used = new Set<string>()
  for (const c of cards) {
    const text = [c.question, c.answer, ...(c.options ?? []), ...(c.pairs ?? []).flatMap(p => [p.left, p.right])].join('\n')
    for (const m of text.matchAll(/(?:images|audio)\/[\w.-]+/g)) used.add(m[0])
    if (c.occlusion?.image) used.add(c.occlusion.image)
  }
  return [...used]
}

// "1.4 MB"
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}
