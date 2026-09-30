// Converts Anki's HTML fields into the app's card markup. The HTML is turned into the same JSON the
// editor uses and saved with serializeMarkup, so escaping always matches what the app parses.
// Kept: paragraphs and line breaks, bold/italic/inline code, colors (mapped to the app's palette),
// headings, lists (one level), MathJax (\( \) and \[ \], plus old [$] / [latex] tags), <pre> code
// blocks, and images. Tables become "cell | cell" lines. Scripts, form controls, hidden elements,
// and images wrapped in outside links (badges and ads) are dropped.
import type { JSONContent } from '@tiptap/core'
import { serializeMarkup } from '@/lib/markup'

export interface ConvertReport {
  images: number
  imagesDropped: number
  audio: number
  tables: number
}

export const emptyReport = (): ConvertReport => ({ images: 0, imagesDropped: 0, audio: 0, tables: 0 })

export interface ConvertOptions {
  // The markup src for a media file name, or null to leave the image out
  image?: (name: string) => string | null
  // Classes and ids the note type's CSS hides (see hiddenSelectors)
  hidden?: { classes: Set<string>; ids: Set<string> }
}

// Simple ".class" / "#id" selectors that a note type's stylesheet sets to display: none. Templates
// use these for helper text that should never show (or that scripts reveal).
export function hiddenSelectors(css: string): { classes: Set<string>; ids: Set<string> } {
  const classes = new Set<string>(), ids = new Set<string>()
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/display\s*:\s*none/i.test(rule[2])) continue
    for (const sel of rule[1].split(',').map(s => s.trim())) {
      const m = sel.match(/^([.#])([\w-]+)$/)
      if (m) (m[1] === '.' ? classes : ids).add(m[2])
    }
  }
  return { classes, ids }
}

// LaTeX source inside some HTML (MathJax can span tags and line breaks)
function latexOf(html: string): string {
  const text = new DOMParser().parseFromString(`<body>${html.replace(/<br\s*\/?>/gi, ' ')}</body>`, 'text/html').body.textContent ?? ''
  return text.replace(/ /g, ' ').trim()
}
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type Mark = { type: string; attrs?: Record<string, unknown> }
type Segment = { kind: 'blocks'; nodes: JSONContent[] } | { kind: 'code'; lang: string; code: string }

const SKIP = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'input', 'button', 'select', 'textarea',
  'audio', 'video', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'canvas', 'map'])
const BLOCK = new Set(['p', 'div', 'section', 'article', 'blockquote', 'center', 'details', 'figure', 'figcaption',
  'header', 'footer', 'main', 'aside', 'nav', 'dl', 'dt', 'dd', 'address', 'form', 'fieldset'])

const PALETTE: [string, number][] = [['red', 0], ['orange', 30], ['yellow', 55], ['green', 120], ['blue', 220], ['purple', 275], ['pink', 330]]

// An HTML color → one of the app's named colors (null for black, white, and near-grays)
export function colorKey(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray', 'grey'].includes(v)) return v === 'grey' ? 'gray' : v
  let r: number, g: number, b: number
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(c => c + c).join('') : hex[1]
    ;[r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  } else if (rgb) {
    ;[r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number)
  } else return null
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
  if (s < 0.2 || l > 0.92 || l < 0.12) return s < 0.15 && l > 0.3 && l < 0.7 ? 'gray' : null
  const d = max - min
  let hue = max === r / 255 ? ((g - b) / 255 / d) % 6 : max === g / 255 ? (b - r) / 255 / d + 2 : (r - g) / 255 / d + 4
  hue = (hue * 60 + 360) % 360
  let best = PALETTE[0][0], bestDist = 999
  for (const [name, h] of PALETTE) {
    const dist = Math.min(Math.abs(hue - h), 360 - Math.abs(hue - h))
    if (dist < bestDist) { best = name; bestDist = dist }
  }
  return best
}

export function htmlToMarkup(html: string, report: ConvertReport = emptyReport(), opts: ConvertOptions = {}): string {
  const prepared = html
    .replace(/\[sound:[^\]]*\]/g, () => { report.audio++; return '' })
    .replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/g, '\\[$1\\]')
    .replace(/\[\$\]([\s\S]*?)\[\/\$\]/g, '\\($1\\)')
    .replace(/\[latex\]([\s\S]*?)\[\/latex\]/g, '\\($1\\)')
    // Math becomes a placeholder element first, so equations spanning tags or <br>s stay whole
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => `<anki-math data-display="1" data-tex="${attr(latexOf(tex))}"></anki-math>`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => `<anki-math data-tex="${attr(latexOf(tex))}"></anki-math>`)
  const doc = new DOMParser().parseFromString(`<body>${prepared}</body>`, 'text/html')

  const segments: Segment[] = []
  let blocks: JSONContent[] = []
  let para: JSONContent[] = []

  const flushPara = () => {
    para = tidyRuns(para)
    // Trim the paragraph's outer whitespace
    while (para.length && para[0].type === 'text' && !para[0].text!.trim()) para.shift()
    while (para.length && para[para.length - 1].type === 'text' && !para[para.length - 1].text!.trim()) para.pop()
    if (para.length) {
      if (para[0].type === 'text') para[0] = { ...para[0], text: para[0].text!.replace(/^\s+/, '') }
      const last = para[para.length - 1]
      if (last.type === 'text') para[para.length - 1] = { ...last, text: last.text!.replace(/\s+$/, '') }
      blocks.push({ type: 'paragraph', content: para })
    }
    para = []
  }
  const pushBlock = (node: JSONContent) => { flushPara(); blocks.push(node) }
  const blankLine = () => { if (para.length) flushPara(); else blocks.push({ type: 'paragraph' }) }
  const flushBlocks = () => { flushPara(); if (blocks.length) segments.push({ kind: 'blocks', nodes: blocks }); blocks = [] }

  const addText = (raw: string, marks: Mark[], inCode: boolean) => {
    const text = raw.replace(/ /g, ' ').replace(/\s+/g, ' ')
    if (!text) return
    const withMarks = (t: string): JSONContent => ({ type: 'text', text: t, ...(marks.length ? { marks } : {}) })
    para.push(withMarks(text))
  }

  const hidden = (el: Element) =>
    el.hasAttribute('hidden') || /(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(el.getAttribute('style') ?? '') ||
    (!!opts.hidden && (opts.hidden.ids.has(el.id) || Array.from(el.classList).some(c => opts.hidden!.classes.has(c))))

  const marksFor = (el: Element, marks: Mark[]): Mark[] => {
    const tag = el.tagName.toLowerCase()
    const style = el.getAttribute('style') ?? ''
    const next = [...marks]
    const add = (m: Mark) => { if (!next.some(x => x.type === m.type)) next.push(m) }
    if (tag === 'b' || tag === 'strong' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) add({ type: 'bold' })
    if (tag === 'i' || tag === 'em' || /font-style\s*:\s*italic/i.test(style)) add({ type: 'italic' })
    if (tag === 'code' || tag === 'kbd' || tag === 'tt' || tag === 'samp') add({ type: 'code' })
    const color = el.getAttribute('color') ?? style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]
    const key = color ? colorKey(color) : null
    if (key) { const i = next.findIndex(m => m.type === 'color'); if (i >= 0) next.splice(i, 1); next.push({ type: 'color', attrs: { color: key } }) }
    return next
  }

  const imageBlock = (el: Element) => {
    if (el.closest('a[href^="http"]')) return // badges and ads ("support me" links)
    const raw = el.getAttribute('src') ?? ''
    if (!raw) return
    if (/^(https?:|data:)/i.test(raw)) { report.imagesDropped++; return }
    let name = raw
    try { name = decodeURIComponent(raw) } catch {}
    const src = opts.image?.(name) ?? null
    if (!src) { report.imagesDropped++; return }
    report.images++
    pushBlock({ type: 'image', attrs: { src, alt: el.getAttribute('alt') ?? '' } })
  }

  function walk(node: Node, marks: Mark[], inCode = false) {
    if (node.nodeType === Node.TEXT_NODE) { addText(node.textContent ?? '', marks, inCode); return }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (SKIP.has(tag) || hidden(el)) return

    if (tag === 'br') { blankLine(); return }
    if (tag === 'anki-math') {
      const latex = el.getAttribute('data-tex') ?? ''
      if (!latex) return
      if (el.hasAttribute('data-display')) pushBlock({ type: 'mathBlock', attrs: { latex } })
      else para.push({ type: 'mathInline', attrs: { latex, display: false } })
      return
    }
    // A collapsible section with nothing in it but its label (e.g. an unused "Example" field)
    if (tag === 'details') {
      const body = el.cloneNode(true) as Element
      body.querySelector('summary')?.remove()
      const images = Array.from(body.querySelectorAll('img')).filter(img => !img.closest('a[href^="http"]'))
      if (!(body.textContent ?? '').trim() && !images.length && !body.querySelector('anki-math')) return
    }
    if (tag === 'img') { imageBlock(el); return }
    if (tag === 'hr') { flushPara(); return }
    if (tag === 'pre') {
      flushBlocks()
      const clone = el.cloneNode(true) as Element
      clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
      const cls = `${el.getAttribute('class') ?? ''} ${el.querySelector('code')?.getAttribute('class') ?? ''}`
      const lang = cls.match(/(?:language|lang)-([\w+#-]+)/)?.[1] ?? ''
      const code = (clone.textContent ?? '').replace(/ /g, ' ').replace(/\n+$/, '')
      if (code.trim()) segments.push({ kind: 'code', lang, code })
      return
    }
    if (/^h[1-6]$/.test(tag)) {
      flushPara()
      el.childNodes.forEach(c => walk(c, marks))
      const content = para
      para = []
      if (content.length) blocks.push({ type: 'heading', attrs: { level: Math.min(3, Number(tag[1])) }, content })
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      flushPara()
      const items: JSONContent[] = []
      const collect = (list: Element) => {
        for (const li of Array.from(list.children)) {
          if (li.tagName.toLowerCase() !== 'li' || hidden(li)) continue
          para = []
          const nested: Element[] = []
          li.childNodes.forEach(c => {
            const t = (c as Element).tagName?.toLowerCase()
            if (t === 'ul' || t === 'ol') nested.push(c as Element)
            else walk(c, marks)
          })
          // Block elements inside an item would have flushed it; gather everything into the item
          const inner = blocks.splice(0).flatMap(b => b.content ?? [])
          const content = [...inner, ...para]
          para = []
          if (content.length) items.push({ type: 'listItem', content: [{ type: 'paragraph', content }] })
          // Nested lists are flattened (the app's lists have one level)
          nested.forEach(collect)
        }
      }
      const before = blocks
      blocks = []
      collect(el)
      blocks = before
      if (items.length) blocks.push({ type: tag === 'ol' ? 'orderedList' : 'bulletList', ...(tag === 'ol' ? { attrs: { start: 1 } } : {}), content: items })
      return
    }
    if (tag === 'table') {
      flushPara()
      report.tables++
      for (const tr of Array.from(el.querySelectorAll('tr'))) {
        const cells = Array.from(tr.children).filter(c => /^t[dh]$/i.test(c.tagName))
        cells.forEach((cell, i) => {
          if (i > 0) addText(' | ', marks, false)
          cell.childNodes.forEach(c => walk(c, cell.tagName.toLowerCase() === 'th' ? marksFor(cell, [...marks, { type: 'bold' }]) : marks))
        })
        flushPara()
      }
      return
    }

    const isBlock = BLOCK.has(tag) || tag === 'summary' || tag === 'li'
    if (isBlock) flushPara()
    const childMarks = marksFor(el, tag === 'summary' ? [...marks, { type: 'bold' }] : marks)
    el.childNodes.forEach(c => walk(c, childMarks, inCode || tag === 'code'))
    if (isBlock) flushPara()
  }

  doc.body.childNodes.forEach(n => walk(n, []))
  flushBlocks()

  const text = segments.map(s => {
    if (s.kind === 'code') return '```' + s.lang + '\n' + s.code + '\n```'
    // Collapse runs of blank lines and drop leading/trailing ones
    const nodes: JSONContent[] = []
    for (const n of s.nodes) {
      const blank = n.type === 'paragraph' && !n.content?.length
      if (blank && (!nodes.length || (nodes[nodes.length - 1].type === 'paragraph' && !nodes[nodes.length - 1].content?.length))) continue
      nodes.push(n)
    }
    while (nodes.length && nodes[nodes.length - 1].type === 'paragraph' && !nodes[nodes.length - 1].content?.length) nodes.pop()
    return serializeMarkup({ type: 'doc', content: nodes })
  }).filter(Boolean)
  return text.join('\n').trim()
}

// The app's *italic* / **bold** markup can't nest or overlap, and a space just inside a delimiter
// breaks it, but Anki HTML does both constantly ("<i>an <b>element</b> of</i>"). So before saving:
// spaces move outside formatting, whitespace-only runs lose it, and touching runs with different
// bold/italic merge into one run with both (a word may gain bold, but the text reads right).
const EMPHASIS = new Set(['bold', 'italic', 'code'])
function tidyRuns(runs: JSONContent[]): JSONContent[] {
  const marksOf  = (n: JSONContent) => (n.marks ?? []) as Mark[]
  const emphasis = (n: JSONContent) => marksOf(n).filter(m => EMPHASIS.has(m.type)).map(m => m.type).sort().join()
  const color    = (n: JSONContent) => (marksOf(n).find(m => m.type === 'color')?.attrs?.color as string | undefined) ?? ''
  const text     = (t: string, marks: Mark[]): JSONContent => ({ type: 'text', text: t, ...(marks.length ? { marks } : {}) })

  // 1. Split outer spaces off formatted runs; whitespace keeps its color (so a colored phrase stays one
  // span) but loses bold/italic
  const split: JSONContent[] = []
  for (const n of runs) {
    if (n.type !== 'text' || !marksOf(n).length) { split.push(n); continue }
    const t = n.text ?? ''
    const colorOnly = marksOf(n).filter(m => m.type === 'color')
    if (!t.trim()) { split.push(text(t, colorOnly)); continue }
    const lead = t.match(/^\s*/)![0], trail = t.match(/\s*$/)![0]
    if (lead) split.push(text(lead, colorOnly))
    split.push(text(t.slice(lead.length, t.length - trail.length), marksOf(n)))
    if (trail) split.push(text(trail, colorOnly))
  }

  // 2. Merge touching runs: same marks, or both emphasized with the same color (union of emphasis)
  const out: JSONContent[] = []
  for (const n of split) {
    const prev = out[out.length - 1]
    if (prev?.type === 'text' && n.type === 'text') {
      const same = emphasis(prev) === emphasis(n) && color(prev) === color(n)
      const bothEmphasized = emphasis(prev) !== '' && emphasis(n) !== '' && color(prev) === color(n)
      if (same || bothEmphasized) {
        const marks = [...marksOf(prev)]
        for (const m of marksOf(n)) if (!marks.some(x => x.type === m.type)) marks.push(m)
        out[out.length - 1] = text((prev.text ?? '') + (n.text ?? ''), marks)
        continue
      }
    }
    out.push(n)
  }
  return out
}

// Plain text of some HTML (for true/false detection and typed answers)
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return (doc.body.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}
