// Anki's text exports: "Notes in Plain Text" (header lines like #separator:tab, #html:true,
// #deck column:3, #tags column:4) and the older "Cards in Plain Text" (front ⇥ back, no headers).
// Fields may be quoted ("…", with "" for a quote), which lets them contain separators and newlines.
import type { CardDraft } from '@/lib/types'
import { emptyReport, htmlToMarkup, htmlToText } from './html'
import { clozeAnswer, clozeNumbers, clozeStats, parseCloze, renderCloze } from './template'
import type { ImportPlan } from './convert'

const SEPARATORS: Record<string, string> = { tab: '\t', comma: ',', semicolon: ';', space: ' ', pipe: '|', colon: ':' }

function splitRows(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false, i = 0
  while (i < text.length) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue }
      if (c === '"') { quoted = false; i++; continue }
      field += c; i++; continue
    }
    if (c === '"' && field === '') { quoted = true; i++; continue }
    if (c === sep) { row.push(field); field = ''; i++; continue }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []; i++; continue
    }
    field += c; i++
  }
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)
  return rows
}

export function planTextImport(text: string, fileName: string): ImportPlan {
  const report = { ...emptyReport(), cards: 0, skippedEmpty: 0, reversed: 0, unsupported: {} as Record<string, number> }
  const headers: Record<string, string> = {}
  const body = text.replace(/^﻿/, '').split(/\r?\n/).filter(line => {
    const h = line.match(/^#([\w ]+):(.*)$/)
    if (h) headers[h[1].trim().toLowerCase()] = h[2].trim()
    return !h
  }).join('\n')

  const sepName = headers['separator']?.toLowerCase() ?? 'tab'
  const sep = SEPARATORS[sepName] ?? (sepName.length === 1 ? sepName : '\t')
  const html = headers['html'] ? headers['html'].toLowerCase() === 'true' : /<[a-z][^>]*>/i.test(body)
  const col = (key: string) => (headers[key] ? Number(headers[key]) - 1 : -1)
  const deckCol = col('deck column'), tagsCol = col('tags column'), typeCol = col('notetype column'), guidCol = col('guid column')
  const meta = new Set([deckCol, tagsCol, typeCol, guidCol].filter(i => i >= 0))
  const fallbackDeck = fileName.replace(/\.[^.]+$/, '') || 'Imported'

  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  const md = (s: string) => htmlToMarkup(html ? s : escapeHtml(s), report)
  const decks = new Map<string, CardDraft[]>()
  const add = (deck: string, draft: CardDraft) => {
    if (!decks.has(deck)) decks.set(deck, [])
    decks.get(deck)!.push(draft)
    report.cards++
  }

  for (const row of splitRows(body, sep)) {
    const deck = deckCol >= 0 && row[deckCol] ? row[deckCol] : fallbackDeck
    const fields = row.filter((_, i) => !meta.has(i))
    const [front = '', back = '', ...rest] = fields
    const isCloze = /cloze/i.test(typeCol >= 0 ? row[typeCol] ?? '' : '') || /\{\{c\d+::/.test(front)
    if (isCloze) {
      const parts = parseCloze(front)
      const extra = [back, ...rest].map(md).filter(Boolean).join('\n\n')
      for (const n of [...clozeNumbers(parts)].sort((a, b) => a - b)) {
        const stats = clozeStats(parts, n)
        const question = md(renderCloze(parts, n, 'blank'))
        const answer = md(clozeAnswer(parts, n))
        if (stats.count === 1 && !stats.inMath && !extra && question.split('___').length === 2 && answer) {
          add(deck, { type: 'fill_blank', question, answer, options: null, pairs: null })
        } else {
          add(deck, { type: 'open_ended', question: md(renderCloze(parts, n, 'question')), answer: [md(renderCloze(parts, n, 'answer')), extra].filter(Boolean).join('\n\n'), options: null, pairs: null })
        }
      }
      continue
    }
    const question = md(front)
    const answerText = html ? htmlToText(back) : back.trim()
    if (!question || !answerText && !/<img/i.test(back)) { report.skippedEmpty++; continue }
    if (/^(true|false)$/i.test(answerText)) {
      add(deck, { type: 'true_false', question, answer: answerText.toLowerCase() === 'true' ? 'True' : 'False', options: null, pairs: null })
    } else {
      add(deck, { type: 'open_ended', question, answer: [md(back), ...rest.map(md)].filter(Boolean).join('\n\n'), options: null, pairs: null })
    }
  }

  return {
    decks: [...decks.entries()].map(([name, cards]) => ({ path: name.split('::').map(p => p.trim()).filter(Boolean), cards, tags: [] })),
    mediaNames: [],
    media: new Map(),
    report,
  }
}
