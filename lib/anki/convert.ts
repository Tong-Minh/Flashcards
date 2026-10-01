// Turns an Anki collection into the app's cards, grouped by deck. Every card starts as new.
import type { CardDraft } from '@/lib/types'
import { normalizeTag } from '@/lib/sets'
import type { AnkiCollection } from './apkg'
import { emptyReport, hiddenSelectors, htmlToMarkup, htmlToText, type ConvertReport } from './html'
import { askMarker, clozeAnswer, clozeField, clozeStats, parseCloze, renderAllClozes, renderCloze, renderTemplate, typedField, withoutAskMarkers } from './template'

export interface ImportDeck {
  // Deck path, e.g. ["Basic Discrete Math", "Ch 06 Counting", "6.1 The Basics of Counting"]
  path: string[]
  cards: CardDraft[]
  tags: string[]
}

export interface ImportPlan {
  decks: ImportDeck[]
  // Images the cards use, referenced in their markup as "anki-media/<index>"
  mediaNames: string[]
  media: Map<string, () => Promise<Uint8Array>>
  report: ConvertReport & { cards: number; skippedEmpty: number; unsupported: Record<string, number> }
}

export const MEDIA_PREFIX = 'anki-media/'

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

// Field names a template uses, in order ({{Field}}, {{#Field}}, {{text:Field}}…)
function templateFields(fmt: string): Set<string> {
  const names = new Set<string>()
  for (const m of fmt.matchAll(/\{\{\s*[#^/]?\s*(?:[^{}:]+:)*([^{}]+?)\s*\}\}/g)) names.add(m[1])
  return names
}

// Bookkeeping fields that aren't card content: "ID", "Source", or values like "LoF-ES-EN-0001"
const isIdField = (name: string, value: string) =>
  /^(id|guid|note ?id|sort ?field|source|url|link|tags?)$/i.test(name.trim()) || /^[\w-]+-\d+$/.test(htmlToText(value))

// A note with only a front, split into question and answer: leading heading lines vs the rest, or
// else the first of its fields vs the others. Null if it can't be split.
function splitInfoNote(front: string, fieldTexts: string[]): [string, string] | null {
  const lines = front.split('\n')
  let i = 0
  while (i < lines.length && (/^#{1,3} /.test(lines[i]) || (!lines[i].trim() && i > 0 && /^#{1,3} /.test(lines[i - 1])))) i++
  const head = lines.slice(0, i).join('\n').trim(), rest = lines.slice(i).join('\n').trim()
  if (head && rest) return [head, rest]
  if (fieldTexts.length >= 2) return [fieldTexts[0], fieldTexts.slice(1).join('\n\n')]
  return null
}

export function planImport(col: AnkiCollection, { images }: { images: boolean }): ImportPlan {
  const report = { ...emptyReport(), cards: 0, skippedEmpty: 0, unsupported: {} as Record<string, number> }
  const mediaNames: string[] = []
  const imageSrc = (name: string) => {
    if (!images || !col.media.has(name)) return null
    let i = mediaNames.indexOf(name)
    if (i < 0) i = mediaNames.push(name) - 1
    return MEDIA_PREFIX + i
  }
  const hiddenByModel = new Map<number, ReturnType<typeof hiddenSelectors>>()

  const byDeck = new Map<number, { cards: CardDraft[]; tagCounts: Map<string, number> }>()

  for (const card of col.cards) {
    const note  = col.notes.get(card.nid)
    const model = note && col.models.get(note.mid)
    if (!note || !model) continue
    if (!hiddenByModel.has(model.id)) hiddenByModel.set(model.id, hiddenSelectors(model.css))
    const hidden = hiddenByModel.get(model.id)!
    const md = (html: string) => htmlToMarkup(html, report, { image: imageSrc, hidden })
    const fields: Record<string, string> = {}
    model.fields.forEach((name, i) => { fields[name] = note.fields[i] ?? '' })
    const deckName = col.decks.get(card.did) ?? 'Imported'

    const unsupported = (why: string) => { report.unsupported[why] = (report.unsupported[why] ?? 0) + 1 }
    const tmpl0 = model.templates[0]
    if (/image.?occlusion/i.test(model.name) || model.templates.some(t => /image-occlusion:/i.test(t.qfmt))) { unsupported('Image Occlusion'); continue }

    let draft: CardDraft | null = null
    if (model.cloze) {
      const name  = (tmpl0 && clozeField(tmpl0.qfmt)) ?? model.fields[0]
      const allParts = parseCloze(fields[name] ?? '')
      const n        = card.ord + 1
      const ask      = askMarker(allParts, n)
      const parts    = withoutAskMarkers(allParts)
      const stats    = clozeStats(parts, n)
      if (stats.count === 0 && !ask) { report.skippedEmpty++; continue }
      // What the back adds under the cloze text (e.g. "Back Extra"): the back template with the cloze
      // and front left out, cleaned up like any other HTML (hidden and empty sections dropped)
      const extra = tmpl0 ? md(renderTemplate(tmpl0.afmt, fields, { FrontSide: '', Tags: '', Deck: deckName, Card: tmpl0.name, Type: model.name })) : ''
      const answer = clozeAnswer(parts, n)
      if (ask === 'ans') {
        // The prompt as written, with the note's Answer field on the back
        const answerField = model.fields.find(f => /^answer$/i.test(f))
        draft = {
          type: 'open_ended',
          question: md(renderCloze(parts, -1, 'plain')),
          answer: [answerField ? md(fields[answerField]) : '', extra].filter(Boolean).join('\n\n'),
          options: null,
          pairs: null,
        }
        if (!draft.question || !draft.answer) { draft = null; report.skippedEmpty++; continue }
      } else if (ask === 'all') {
        draft = {
          type: 'open_ended',
          question: md(renderAllClozes(parts, 'question')),
          answer: [md(renderAllClozes(parts, 'answer')), extra].filter(Boolean).join('\n\n'),
          options: null,
          pairs: null,
        }
      } else if (stats.count === 1 && !stats.inMath && !extra) {
        const question = md(renderCloze(parts, n, 'blank'))
        const plain = md(answer)
        if (question.split('___').length === 2 && plain) draft = { type: 'fill_blank', question, answer: plain, options: null, pairs: null }
      }
      if (!draft) {
        draft = {
          type: 'open_ended',
          question: md(renderCloze(parts, n, 'question')),
          answer: [md(renderCloze(parts, n, 'answer')), extra].filter(Boolean).join('\n\n'),
          options: null,
          pairs: null,
        }
      }
    } else {
      const tmpl = model.templates[card.ord] ?? tmpl0
      if (!tmpl) continue
      // Tags aren't rendered into cards (templates often print them for a script to style)
      const special = { Tags: '', Deck: deckName, Subdeck: deckName.split('::').pop()!, Card: tmpl.name, Type: model.name }
      const qHtml = renderTemplate(tmpl.qfmt, fields, special)
      const aHtml = renderTemplate(tmpl.afmt, fields, { ...special, FrontSide: qHtml })
      // The back usually repeats the front above <hr id=answer>; keep what's below it
      const hr = aHtml.match(/<hr[^>]*id\s*=\s*["']?answer["']?[^>]*>/i)
      const backHtml = hr ? aHtml.slice(hr.index! + hr[0].length) : aHtml.includes(qHtml) && qHtml.trim() ? aHtml.replace(qHtml, '') : aHtml
      let question = md(qHtml)
      if (!question) { report.skippedEmpty++; continue }
      const typed = typedField(tmpl.qfmt)
      const backText = htmlToText(backHtml)
      if (typed && fields[typed] !== undefined && htmlToText(fields[typed])) {
        draft = { type: 'typed', question, answer: htmlToText(fields[typed]), options: null, pairs: null }
      } else if (/^(true|false)$/i.test(backText)) {
        draft = { type: 'true_false', question, answer: backText.toLowerCase() === 'true' ? 'True' : 'False', options: null, pairs: null }
      } else {
        let answer = md(backHtml)
        if (!answer && /<script/i.test(tmpl.afmt)) {
          // The back is filled in by a script ({{FrontSide}} plus JavaScript), which we don't run:
          // show the note's fields the front doesn't use instead (translation, notes…)
          const onFront = templateFields(tmpl.qfmt)
          answer = model.fields
            .filter(name => !onFront.has(name) && !isIdField(name, fields[name] ?? ''))
            .map(name => md(fields[name] ?? ''))
            .filter(Boolean)
            .join('\n\n')
        } else if (!answer) {
          // A front-only "info" note (you read it, then press Good): its heading becomes the
          // question and the rest the answer, or else its first field and the rest
          const split = splitInfoNote(question, [...templateFields(tmpl.qfmt)].filter(n => n in fields).map(n => md(fields[n])).filter(Boolean))
          if (split) [question, answer] = split
        }
        if (!answer) { report.skippedEmpty++; continue }
        draft = { type: 'open_ended', question, answer, options: null, pairs: null }
      }
    }

    if (!byDeck.has(card.did)) byDeck.set(card.did, { cards: [], tagCounts: new Map() })
    const deck = byDeck.get(card.did)!
    deck.cards.push(draft)
    report.cards++
    // Only short, flat tags make useful set tags (not "Course::Chapter::Section" hierarchies)
    for (const t of note.tags) if (!t.includes('::') && t.length <= 30) deck.tagCounts.set(t, (deck.tagCounts.get(t) ?? 0) + 1)
  }

  const decks = [...byDeck.entries()]
    .map(([did, d]) => ({
      path: (col.decks.get(did) ?? 'Imported').split('::').map(p => p.trim()).filter(Boolean),
      cards: d.cards,
      tags: [...d.tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => normalizeTag(t)).filter(Boolean),
    }))
    .sort((a, b) => naturalCompare(a.path.join('::'), b.path.join('::')))

  return { decks, mediaNames, media: col.media, report }
}

// Sets to create, when decks are grouped `depth` levels deep: the top-level deck becomes a collection
// and the levels below it name the set ("Ch 06 Counting › 6.1 The Basics of Counting").
export interface ImportGroup { key: string; name: string; collection: string | null; cards: CardDraft[]; tags: string[] }

export function groupDecks(decks: ImportDeck[], depth: number): ImportGroup[] {
  const groups = new Map<string, ImportGroup>()
  for (const deck of decks) {
    const path = deck.path.slice(0, depth)
    const key = path.join('::')
    const nested = path.length > 1
    if (!groups.has(key)) {
      groups.set(key, { key, name: nested ? path.slice(1).join(' › ') : path[0], collection: nested ? path[0] : null, cards: [], tags: [] })
    }
    const g = groups.get(key)!
    g.cards.push(...deck.cards)
    for (const t of deck.tags) if (!g.tags.includes(t) && g.tags.length < 5) g.tags.push(t)
  }
  return [...groups.values()]
}
