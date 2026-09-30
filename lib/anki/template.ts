// Anki card templates ({{Field}}, {{#Field}}…{{/Field}}, filters) and cloze deletions ({{c1::…::hint}}).

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
// Fields holding only an image or other markup still count as filled
const isFilled = (s: string | undefined) => !!s && (stripHtml(s) !== '' || /<img/i.test(s))

// Renders a template with a note's fields. {{cloze:X}} and {{type:X}} render as empty: clozes are
// handled separately, and typed answers become the app's own "type the answer" cards.
export function renderTemplate(fmt: string, fields: Record<string, string>, special: Record<string, string> = {}): string {
  const lookup = (name: string) => special[name] ?? fields[name] ?? ''
  let out = fmt
  // Conditional sections, innermost first
  for (let guard = 0; guard < 50; guard++) {
    const next = out.replace(/\{\{([#^])\s*([^}]+?)\s*\}\}((?:(?!\{\{[#^])[\s\S])*?)\{\{\/\s*\2\s*\}\}/g,
      (_, kind: string, name: string, inner: string) => (isFilled(lookup(name)) === (kind === '#') ? inner : ''))
    if (next === out) break
    out = next
  }
  return out.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, ref: string) => {
    const parts   = ref.split(':').map(p => p.trim())
    const name    = parts.pop()!
    const filters = parts.map(p => p.toLowerCase())
    if (filters.includes('cloze') || filters.includes('type') || filters.includes('tts') || filters.includes('cloze-only')) return ''
    const value = lookup(name)
    return filters.includes('text') ? stripHtml(value) : value
  })
}

// The field a template shows with {{type:Field}} (a typed answer), if any
export function typedField(fmt: string): string | null {
  return fmt.match(/\{\{\s*type:(?:cloze:)?\s*([^}]+?)\s*\}\}/i)?.[1] ?? null
}

// The field a cloze template deletes from ({{cloze:Text}})
export function clozeField(fmt: string): string | null {
  return fmt.match(/\{\{\s*(?:[^}:]+:)*cloze:\s*([^}]+?)\s*\}\}/i)?.[1] ?? null
}

// ── Clozes ────────────────────────────────────────────────────────────────────

type ClozePart = string | { n: number; hint: string | null; inMath: boolean; parts: ClozePart[] }

// Parses {{cN::text::hint}}, including nested clozes and "}}" that belongs to LaTeX inside one.
// Each cloze notes whether it sits inside MathJax (\( … \) or \[ … \]).
export function parseCloze(text: string): ClozePart[] {
  // braces: unclosed "{" inside this cloze (LaTeX like \frac{a}{b}), so a "}}" closes those first
  type Open = { n: number; inMath: boolean; parts: ClozePart[]; braces: number }
  const root: ClozePart[] = []
  const stack: Open[] = []
  const current = () => (stack.length ? stack[stack.length - 1].parts : root)
  let buf = ''
  let mathDepth = 0
  const flush = () => { if (buf) { current().push(buf); buf = '' } }
  let i = 0
  while (i < text.length) {
    const open = text.slice(i).match(/^\{\{c(\d+)::/)
    if (open) {
      flush()
      stack.push({ n: Number(open[1]), inMath: mathDepth > 0, parts: [], braces: 0 })
      i += open[0].length
      continue
    }
    const top = stack[stack.length - 1]
    if (top && text[i] === '\\' && (text[i + 1] === '{' || text[i + 1] === '}')) { buf += text.slice(i, i + 2); i += 2; continue }
    if (top && text[i] === '{') { top.braces++; buf += '{'; i++; continue }
    if (top && text[i] === '}' && top.braces > 0) { top.braces--; buf += '}'; i++; continue }
    if (text.startsWith('\\(', i) || text.startsWith('\\[', i)) { mathDepth++; buf += text.slice(i, i + 2); i += 2; continue }
    if (text.startsWith('\\)', i) || text.startsWith('\\]', i)) { mathDepth = Math.max(0, mathDepth - 1); buf += text.slice(i, i + 2); i += 2; continue }
    if (text.startsWith('}}', i) && stack.length) {
      flush()
      const node = stack.pop()!
      // The hint is whatever follows the last top-level "::"
      let hint: string | null = null
      const last = node.parts[node.parts.length - 1]
      if (typeof last === 'string' && last.includes('::')) {
        const k = last.lastIndexOf('::')
        hint = last.slice(k + 2)
        node.parts[node.parts.length - 1] = last.slice(0, k)
      }
      current().push({ n: node.n, hint, inMath: node.inMath, parts: node.parts })
      i += 2
      continue
    }
    buf += text[i++]
  }
  flush()
  // Unclosed clozes: keep their text
  while (stack.length) { const node = stack.pop()!; current().push(...node.parts) }
  return root
}

export function clozeNumbers(parts: ClozePart[], into = new Set<number>()): Set<number> {
  for (const p of parts) if (typeof p !== 'string') { into.add(p.n); clozeNumbers(p.parts, into) }
  return into
}

// Occurrences of cloze n, and whether any sits inside math
export function clozeStats(parts: ClozePart[], n: number): { count: number; inMath: boolean; hint: string | null } {
  let count = 0, inMath = false, hint: string | null = null
  const walk = (ps: ClozePart[]) => {
    for (const p of ps) {
      if (typeof p === 'string') continue
      if (p.n === n) { count++; inMath ||= p.inMath; hint ??= p.hint }
      walk(p.parts)
    }
  }
  walk(parts)
  return { count, inMath, hint }
}

const BLUE = '#2563eb'

// HTML for cloze n shown as:
// - 'blank': the deletion replaced by `blank` (fill-in-the-blank cards)
// - 'question': a visible gap, [hint] or […], boxed inside math
// - 'answer': the deletion highlighted in blue (in math too)
// - 'plain': just the text (e.g. the answer of a fill-in-the-blank card)
// Other clozes show their text, as in Anki.
export function renderCloze(parts: ClozePart[], n: number, mode: 'blank' | 'question' | 'answer' | 'plain', blank = '___'): string {
  return parts.map(p => {
    if (typeof p === 'string') return p
    const inner = renderCloze(p.parts, n, mode === 'blank' || mode === 'question' ? 'plain' : mode, blank)
    if (p.n !== n) return renderCloze(p.parts, n, mode, blank)
    if (mode === 'plain') return inner
    if (mode === 'blank') return blank + (p.hint ? ` (${p.hint})` : '')
    if (mode === 'question') {
      return p.inMath
        ? `\\boxed{${p.hint ? `\\text{${p.hint.replace(/[{}\\]/g, '')}}` : '\\;?\\;'}}`
        : `<b>[${p.hint ?? '…'}]</b>`
    }
    return p.inMath ? `{\\color{${BLUE}}${inner}}` : `<b><span style="color:${BLUE}">${inner}</span></b>`
  }).join('')
}

// "Cloze Overlapping"-style note types use two marker clozes: {{cN::ask-ans}} (card N asks the prompt
// and shows the Answer field on the back) and {{cN::ask-all}} (card N blanks every cloze at once).
// Other cards drop the markers.
const plainOf = (parts: ClozePart[]): string =>
  parts.map(p => (typeof p === 'string' ? p : plainOf(p.parts))).join('').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

export function askMarker(parts: ClozePart[], n: number): 'ans' | 'all' | null {
  for (const p of parts) {
    if (typeof p === 'string') continue
    if (p.n === n) { const t = plainOf(p.parts); if (t === 'ask-ans') return 'ans'; if (t === 'ask-all') return 'all' }
    const inner = askMarker(p.parts, n)
    if (inner) return inner
  }
  return null
}

export function withoutAskMarkers(parts: ClozePart[]): ClozePart[] {
  return parts.flatMap<ClozePart>(p => {
    if (typeof p === 'string') return [p]
    if (/^ask-(ans|all)$/.test(plainOf(p.parts))) return []
    return [{ ...p, parts: withoutAskMarkers(p.parts) }]
  })
}

// Every cloze hidden (question) or highlighted (answer) at once, for "ask-all" cards
export function renderAllClozes(parts: ClozePart[], mode: 'question' | 'answer'): string {
  const numbers = clozeNumbers(parts)
  let html = ''
  for (const p of parts) {
    if (typeof p === 'string') { html += p; continue }
    html += renderCloze([p], p.n, mode)
  }
  return numbers.size ? html : renderCloze(parts, -1, 'plain')
}

// The deleted text of cloze n (all occurrences, joined), for fill-in-the-blank answers
export function clozeAnswer(parts: ClozePart[], n: number): string {
  const found: string[] = []
  const walk = (ps: ClozePart[]) => {
    for (const p of ps) {
      if (typeof p === 'string') continue
      if (p.n === n) found.push(renderCloze(p.parts, n, 'plain'))
      else walk(p.parts)
    }
  }
  walk(parts)
  return found.join(', ')
}
