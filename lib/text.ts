const MIN_TAIL_CHARS = 12
const MAX_TAIL_WORDS = 3

// Glues the last few words together with non-breaking spaces so a wrapped title never ends with a
// lone word or a tiny fragment on its own line ("… (Prep" / "2)"). Words are added from the end until
// the glued tail is at least ~12 characters or 3 words, and at least one word is left free to wrap
// before it. Pair with text-pretty.
export function noOrphan(text: string | null | undefined): string {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length < 3) return words.join(' ')
  let tail = 1
  while (
    tail < MAX_TAIL_WORDS &&
    tail < words.length - 1 &&
    words.slice(-tail).join(' ').length < MIN_TAIL_CHARS
  ) tail++
  return words.slice(0, -tail).join(' ') + ' ' + words.slice(-tail).join(' ')
}
