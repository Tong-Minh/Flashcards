// Card text markup: **bold**, *italic*, ***both***, `code`, [red]color[/red], $math$, $$display$$,
// "# " headings, "- " / "1. " list lines, a line that is only $$…$$ (centered math block),
// and backslash escapes for literal \ * $ ` [ ] # - .
// This module is the single source of truth for tokenizing it (used by the renderer) and for
// converting it to/from Tiptap documents (used by the editor).

import type { JSONContent } from '@tiptap/core'

export type InlineToken =
  | { t: 'text';   s: string }
  | { t: 'code';   s: string }
  | { t: 'math';   s: string; display: boolean }
  | { t: 'bold';   children: InlineToken[] }
  | { t: 'italic'; children: InlineToken[] }
  | { t: 'color';  color: string; children: InlineToken[] }

// Order matters: escape > code > display-math > inline-math > bold+italic > bold > italic > color
const INLINE_SRC = /\\([*$\[\]`\\#.\-])|`([^`\n]+)`|\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$|\*\*\*((?:\\.|[^*\\\n])+)\*\*\*|\*\*((?:\\.|[^*\\\n])+)\*\*|\*((?:\\.|[^*\\\n])+)\*|\[([a-zA-Z]+)\]([\s\S]+?)\[\/\8\]/g

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  const pushText = (s: string) => {
    const prev = tokens[tokens.length - 1]
    if (prev?.t === 'text') prev.s += s
    else tokens.push({ t: 'text', s })
  }
  const re = new RegExp(INLINE_SRC.source, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pushText(text.slice(last, m.index))
    if      (m[1] !== undefined) pushText(m[1])
    else if (m[2] !== undefined) tokens.push({ t: 'code',   s: m[2] })
    else if (m[3] !== undefined) tokens.push({ t: 'math',   s: m[3], display: true  })
    else if (m[4] !== undefined) tokens.push({ t: 'math',   s: m[4], display: false })
    else if (m[5] !== undefined) tokens.push({ t: 'bold',   children: [{ t: 'italic', children: tokenizeInline(m[5]) }] })
    else if (m[6] !== undefined) tokens.push({ t: 'bold',   children: tokenizeInline(m[6]) })
    else if (m[7] !== undefined) tokens.push({ t: 'italic', children: tokenizeInline(m[7]) })
    else if (m[8] !== undefined) tokens.push({ t: 'color',  color: m[8], children: tokenizeInline(m[9]) })
    last = m.index + m[0].length
  }
  if (last < text.length) pushText(text.slice(last))
  return tokens
}

export function tokensToPlainText(tokens: InlineToken[]): string {
  return tokens.map(tok => ('children' in tok ? tokensToPlainText(tok.children) : tok.s)).join('')
}

// ── Markup → Tiptap JSON ──────────────────────────────────────────────────────

type JSONMark = NonNullable<JSONContent['marks']>[number]

function sameMarks(a: JSONMark[] = [], b: JSONMark[] = []): boolean {
  return a.length === b.length && a.every((m, i) => m.type === b[i].type && m.attrs?.color === b[i].attrs?.color)
}

function inlineToJSON(tokens: InlineToken[], marks: JSONMark[] = []): JSONContent[] {
  const out: JSONContent[] = []
  const pushText = (text: string, ms: JSONMark[]) => {
    if (!text) return
    const prev = out[out.length - 1]
    if (prev?.type === 'text' && sameMarks(prev.marks, ms)) prev.text += text
    else out.push(ms.length ? { type: 'text', text, marks: ms } : { type: 'text', text })
  }
  for (const tok of tokens) {
    switch (tok.t) {
      case 'text':   pushText(tok.s, marks); break
      case 'code':   pushText(tok.s, [...marks, { type: 'code' }]); break
      case 'math':   out.push({ type: 'mathInline', attrs: { latex: tok.s, display: tok.display } }); break
      case 'bold':   inlineToJSON(tok.children, [...marks, { type: 'bold' }]).forEach(n => n.type === 'text' ? pushText(n.text!, n.marks ?? []) : out.push(n)); break
      case 'italic': inlineToJSON(tok.children, [...marks, { type: 'italic' }]).forEach(n => n.type === 'text' ? pushText(n.text!, n.marks ?? []) : out.push(n)); break
      case 'color': {
        const ms = [...marks.filter(m => m.type !== 'color'), { type: 'color', attrs: { color: tok.color } }]
        inlineToJSON(tok.children, ms).forEach(n => n.type === 'text' ? pushText(n.text!, n.marks ?? []) : out.push(n))
        break
      }
    }
  }
  return out
}

export function parseMarkup(text: string, opts: { singleLine?: boolean } = {}): JSONContent {
  if (opts.singleLine) {
    const content = inlineToJSON(tokenizeInline(text.replace(/\n/g, ' ')))
    return { type: 'doc', content: [content.length ? { type: 'paragraph', content } : { type: 'paragraph' }] }
  }
  const paragraph = (s: string): JSONContent => {
    const inner = inlineToJSON(tokenizeInline(s))
    return inner.length ? { type: 'paragraph', content: inner } : { type: 'paragraph' }
  }
  const content: JSONContent[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trimStart()
    const heading = trimmed.match(/^(#{1,3}) (.*)$/)
    const listLine = matchListLine(line)
    if (heading) {
      const inner = inlineToJSON(tokenizeInline(heading[2]))
      content.push({ type: 'heading', attrs: { level: heading[1].length }, ...(inner.length ? { content: inner } : {}) })
    } else if (isMathBlockLine(trimmed)) {
      content.push({ type: 'mathBlock', attrs: { latex: trimmed.slice(2, -2) } })
    } else if (matchImageLine(trimmed)) {
      const image = matchImageLine(trimmed)!
      content.push({ type: 'image', attrs: { src: image.src, alt: image.alt } })
    } else if (matchAudioLine(trimmed)) {
      content.push({ type: 'audio', attrs: { src: matchAudioLine(trimmed)!.src } })
    } else if (listLine) {
      // Consecutive lines of the same list kind form one list
      const type = listLine.ordered ? 'orderedList' : 'bulletList'
      const prev = content[content.length - 1]
      const item = { type: 'listItem', content: [paragraph(listLine.text)] }
      if (prev?.type === type) prev.content!.push(item)
      else content.push({ type, ...(listLine.ordered ? { attrs: { start: listLine.start } } : {}), content: [item] })
    } else {
      content.push(paragraph(line))
    }
  }
  return { type: 'doc', content }
}

// ── Line-level helpers (shared with the renderer) ─────────────────────────────

export function isMathBlockLine(trimmed: string): boolean {
  return trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4
}

// A line that is only ![alt](path) is an image (desktop app only; the path is "images/<file>" in
// the library folder)
export function matchImageLine(trimmed: string): { alt: string; src: string } | null {
  const m = trimmed.match(/^!\[([^\]\n]*)\]\(([^()\s]+)\)$/)
  return m ? { alt: m[1], src: m[2] } : null
}

// A line that is only [sound](audio/<file>) is an audio clip (desktop app only, like images)
export function matchAudioLine(trimmed: string): { src: string } | null {
  const m = trimmed.match(/^\[sound\]\(([^()\s]+)\)$/)
  return m ? { src: m[1] } : null
}

// A side that is nothing but audio (and pictures): it can't be studied without the desktop app
export function isAudioOnly(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  return lines.some(l => matchAudioLine(l)) && lines.every(l => matchAudioLine(l) || matchImageLine(l))
}

// The audio clips on a side of a card, in order (for autoplay)
export function audioClips(text: string): string[] {
  return text.split('\n').map(l => matchAudioLine(l.trim())?.src).filter((s): s is string => !!s)
}

// "- item" / "* item" (bullet) or "3. item" (numbered). Escaped "\- " / "3\. " are plain text.
export function matchListLine(line: string): { ordered: boolean; start: number; text: string } | null {
  const bullet = line.match(/^\s*[-*] (.*)$/)
  if (bullet) return { ordered: false, start: 1, text: bullet[1] }
  const num = line.match(/^\s*(\d{1,9})\. (.*)$/)
  if (num) return { ordered: true, start: Number(num[1]), text: num[2] }
  return null
}

// ── Tiptap JSON → Markup ──────────────────────────────────────────────────────

function escapeText(s: string): string {
  return s
    .replace(/[\\*$`]/g, '\\$&')
    // Brackets only need escaping when they'd form a color tag: any closing tag, or an opening
    // tag whose matching close appears later (so "grid[r][c]" stays clean)
    .replace(/\[(\/?)([a-zA-Z]+)\]/g, (m, slash: string, name: string, offset: number, all: string) =>
      slash || all.indexOf(`[/${name}]`, offset + m.length) !== -1 ? `\\${m}` : m)
}

function wrapRun(node: JSONContent): string {
  if (node.type === 'mathInline') {
    const latex = String(node.attrs?.latex ?? '')
    return node.attrs?.display ? `$$${latex}$$` : `$${latex}$`
  }
  if (node.type !== 'text' || !node.text) return ''
  const has = (t: string) => node.marks?.some(m => m.type === t) ?? false
  let s = has('code') && !/[`\n]/.test(node.text) ? `\`${node.text}\`` : escapeText(node.text)
  const bold = has('bold'), italic = has('italic')
  if (bold && italic) s = `***${s}***`
  else if (bold)      s = `**${s}**`
  else if (italic)    s = `*${s}*`
  return s
}

const colorOf = (n: JSONContent): string | null =>
  (n.type === 'text' && (n.marks?.find(m => m.type === 'color')?.attrs?.color as string | undefined)) || null

function serializeInline(nodes: JSONContent[] = []): string {
  let out = ''
  let i = 0
  while (i < nodes.length) {
    const color = colorOf(nodes[i])
    if (!color) { out += wrapRun(nodes[i++]); continue }
    // Group consecutive runs sharing a color into a single [color]…[/color] span
    let inner = ''
    while (i < nodes.length && colorOf(nodes[i]) === color) inner += wrapRun(nodes[i++])
    out += `[${color}]${inner}[/${color}]`
  }
  return out
}

export function serializeMarkup(doc: JSONContent): string {
  return (doc.content ?? []).map(block => {
    switch (block.type) {
      case 'heading':
        return `${'#'.repeat(Number(block.attrs?.level ?? 1))} ${serializeInline(block.content)}`
      case 'mathBlock':
        return `$$${block.attrs?.latex ?? ''}$$`
      case 'image':
        return `![${String(block.attrs?.alt ?? '').replace(/[\]\n]/g, '')}](${block.attrs?.src ?? ''})`
      case 'audio':
        return `[sound](${block.attrs?.src ?? ''})`
      case 'bulletList':
        return (block.content ?? []).map(item => `- ${serializeInline(item.content?.[0]?.content)}`).join('\n')
      case 'orderedList': {
        const start = Number(block.attrs?.start ?? 1)
        return (block.content ?? []).map((item, i) => `${start + i}. ${serializeInline(item.content?.[0]?.content)}`).join('\n')
      }
      default: {
        // A paragraph that starts like a heading or list item must not become one when re-parsed
        return serializeInline(block.content)
          .replace(/^(\s*)(#{1,3} )/, '$1\\$2')
          .replace(/^(\s*)- /, '$1\\- ')
          .replace(/^(\s*)(\d{1,9})\. /, '$1$2\\. ')
          // …or an image or audio line
          .replace(/^(\s*)!\[/, '$1!\\[')
          .replace(/^(\s*)\[sound\]\(/, '$1\\[sound](')
      }
    }
  }).join('\n')
}
