import type { Flashcard } from './types'

// Tab-separated text format shared by import and export: one card per line, fields separated by
// tabs, and line breaks inside a field written as a literal \n.

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
