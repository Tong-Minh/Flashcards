import type { CardType, Flashcard, MatchPair } from './types'

// Tab-separated text format shared by import and export: one card per line, fields separated by
// tabs, and line breaks inside a field written as a literal \n.
//   question ⇥ answer                        open-ended (fill-in-the-blank if the question has ___)
//   statement ⇥ True|False                   true / false
//   question ⇥ correct ⇥ wrong ⇥ wrong …     multiple choice (4+ fields)
//   [type] question ⇥ answer ⇥ alt …         type the answer (extra fields are also accepted)
//   [match] instructions ⇥ a = b ⇥ c = d …   matching
// A blank-line-separated format (question line, then answer lines) is also accepted on import.

export interface ParsedCard {
  question: string
  answer: string
  options: string[] | null
  pairs: MatchPair[] | null
  type: CardType
}

const TYPE_PREFIX  = /^\[type\]\s*/i
const MATCH_PREFIX = /^\[match\]\s*/i

// Unescape literal \n so code blocks, lists and math blocks survive the one-per-line format — but
// leave math alone, where \n starts LaTeX commands (\neq, \nu, \nabla). Code fences are matched first
// so a $ inside code can't start a math span; \$ is a literal dollar.
function unescapeField(s: string): string {
  return s.replace(/```[\s\S]*?```|\\\$|\$\$[\s\S]*?\$\$|\$[^$]*\$|\\n/g, m =>
    m === '\\n' ? '\n' : m.startsWith('```') ? m.replace(/\\n/g, '\n') : m)
}

function trueFalse(answer: string): 'True' | 'False' | null {
  const a = answer.trim().toLowerCase()
  return a === 'true' ? 'True' : a === 'false' ? 'False' : null
}

// A field that is nothing but one fenced code block
const isCodeOnly = (s: string | undefined) => !!s && /^```[\s\S]*```$/.test(s.trim()) && s.split('```').length === 3

function parseLine(fields: string[]): ParsedCard | null {
  // AIs (and an old version of our own prompt) sometimes give a question's code its own column:
  // question ⇥ code ⇥ answer. The code belongs to the question. Cards whose options or answer are
  // code blocks aren't affected: the column after the code would be code too, or missing.
  const parts = fields.length >= 3 && !MATCH_PREFIX.test(fields[0]) && isCodeOnly(fields[1]) && fields[2] && !isCodeOnly(fields[2])
    ? [`${fields[0]}\n${fields[1]}`, ...fields.slice(2)]
    : fields
  const [first, ...rest] = parts
  if (!first) return null

  if (MATCH_PREFIX.test(first)) {
    const pairs = rest.flatMap(p => {
      const i = p.indexOf(' = ')
      return i > 0 ? [{ left: p.slice(0, i).trim(), right: p.slice(i + 3).trim() }] : []
    }).filter(p => p.left && p.right)
    if (pairs.length < 2) return null
    return { type: 'matching', question: first.replace(MATCH_PREFIX, ''), answer: '', options: null, pairs }
  }

  if (TYPE_PREFIX.test(first)) {
    const question = first.replace(TYPE_PREFIX, '')
    const [answer, ...alts] = rest.filter(Boolean)
    if (!question || !answer) return null
    return { type: 'typed', question, answer, options: alts.length ? alts : null, pairs: null }
  }

  if (parts.length >= 4) {
    // MC: question | correct answer | wrong options…
    const answer = rest[0]
    const options = [answer, ...rest.slice(1, 5)].sort(() => Math.random() - 0.5)
    return { type: 'multiple_choice', question: first, answer, options, pairs: null }
  }

  const answer = rest[0] ?? ''
  if (!answer) return null
  const tf = trueFalse(answer)
  if (tf) return { type: 'true_false', question: first, answer: tf, options: null, pairs: null }
  return { type: first.includes('___') ? 'fill_blank' : 'open_ended', question: first, answer, options: null, pairs: null }
}

export function parseCards(text: string): ParsedCard[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const lines = trimmed.split('\n')

  // Tab-separated: detect by presence of tab in first non-empty line
  if (lines.find(l => l.trim())?.includes('\t')) {
    return lines
      .filter(l => l.trim() && l.includes('\t'))
      .map(line => parseLine(line.split('\t').map(p => unescapeField(p.trim()))))
      .filter((c): c is ParsedCard => c !== null)
  }

  // Blank-line separated: first line is the question, the rest is the answer
  const groups: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (t === '') {
      if (current.length) { groups.push(current); current = [] }
    } else {
      current.push(t)
    }
  }
  if (current.length) groups.push(current)

  return groups
    .filter(g => g.length >= 2)
    .map(g => parseLine([g[0], g.slice(1).join('\n')]))
    .filter((c): c is ParsedCard => c !== null)
}

function escapeField(s: string): string {
  return s.replace(/\t/g, '    ').replace(/\r?\n/g, '\\n')
}

function cardToLine(card: Pick<Flashcard, 'question' | 'answer' | 'type' | 'options' | 'pairs'>): string {
  const q = escapeField(card.question)
  switch (card.type) {
    case 'multiple_choice': {
      const wrong = (card.options ?? []).filter(o => o !== card.answer)
      return [q, escapeField(card.answer), ...wrong.map(escapeField)].join('\t')
    }
    case 'typed':
      return [`[type] ${q}`, escapeField(card.answer), ...(card.options ?? []).map(escapeField)].join('\t')
    case 'matching':
      return [`[match] ${q}`, ...(card.pairs ?? []).map(p => `${escapeField(p.left)} = ${escapeField(p.right)}`)].join('\t')
    default:
      return [q, escapeField(card.answer)].join('\t')
  }
}

export function exportCards(cards: Pick<Flashcard, 'question' | 'answer' | 'type' | 'options' | 'pairs'>[]): string {
  return cards.map(cardToLine).join('\n') + '\n'
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
