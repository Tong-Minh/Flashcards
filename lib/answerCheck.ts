import { tokenizeInline, tokensToPlainText } from './markup'

export type TypedResult = 'correct' | 'close' | 'incorrect'

// Compare on meaning, not formatting: markup, case, accents, spacing, trailing punctuation and a
// leading article don't count.
export function normalizeAnswer(s: string): string {
  return tokensToPlainText(tokenizeInline(s))
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a|an|the) /, '')
    .replace(/[.,;:!?'"`)\]]+$/, '')
    .trim()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

// Typos allowed for an answer of this length: none for very short answers (where one letter
// changes the word), one for normal words, two for long answers.
function typoAllowance(len: number): number {
  if (len <= 3) return 0
  if (len < 10) return 1
  return 2
}

export function checkTypedAnswer(input: string, answer: string, alternates: string[] | null = null): TypedResult {
  const given = normalizeAnswer(input)
  if (!given) return 'incorrect'
  let close = false
  for (const target of [answer, ...(alternates ?? [])].map(normalizeAnswer).filter(Boolean)) {
    if (given === target) return 'correct'
    // Numbers must match exactly: "1999" vs "1998" is a wrong answer, not a typo
    if (/\d/.test(target)) continue
    if (levenshtein(given, target) <= typoAllowance(target.length)) close = true
  }
  return close ? 'close' : 'incorrect'
}
