'use client'

import Prism from 'prismjs'
// Core (prismjs) already bundles: markup, css, clike, javascript
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-swift'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'

const LANG_ALIASES: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python', rb: 'ruby',
  cs: 'csharp', cpp: 'cpp', 'c++': 'cpp', sh: 'bash', shell: 'bash',
  golang: 'go', yml: 'yaml', htm: 'html', xml: 'markup', html: 'markup',
  kt: 'kotlin',
}

type Segment = { type: 'text'; text: string } | { type: 'code'; code: string; lang: string }

export function parseSegments(text: string): Segment[] {
  const segments: Segment[] = []
  const re = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', text: text.slice(last, m.index) })
    segments.push({ type: 'code', lang: m[1] || '', code: m[2].replace(/\n$/, '') })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) })
  return segments.length ? segments : [{ type: 'text', text }]
}

export function hasCodeBlock(text: string): boolean {
  return /```[\s\S]*?```/.test(text)
}

export function previewText(text: string): string {
  const stripped = text.replace(/```[\s\S]*?```/g, '[code]').trim()
  return stripped || '[code block]'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlight(code: string, rawLang: string): string {
  const lang = LANG_ALIASES[rawLang] ?? rawLang
  const grammar = lang ? Prism.languages[lang] : undefined
  if (grammar) return Prism.highlight(code, grammar, lang)
  return escapeHtml(code)
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const displayLang = LANG_ALIASES[lang] ?? lang
  return (
    <div className="my-2 rounded-lg overflow-hidden border border-gray-700/50">
      {displayLang && (
        <div className="px-3 py-1 bg-gray-800 text-xs font-mono text-gray-400 select-none">
          {displayLang}
        </div>
      )}
      <pre className="overflow-x-auto bg-gray-900 p-3 m-0 text-[0.8rem] leading-relaxed">
        <code
          className={displayLang ? `language-${displayLang}` : undefined}
          dangerouslySetInnerHTML={{ __html: highlight(code, lang) }}
        />
      </pre>
    </div>
  )
}

interface Props {
  text: string
  className?: string
}

export function ContentRenderer({ text, className }: Props) {
  const segments = parseSegments(text)
  const anyCode = segments.some(s => s.type === 'code')

  if (!anyCode) {
    return <>{text}</>
  }

  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === 'code'
          ? <CodeBlock key={i} code={seg.code} lang={seg.lang} />
          : seg.text.trim()
            ? <p key={i} className="mb-1 last:mb-0 whitespace-pre-wrap">{seg.text}</p>
            : null
      )}
    </div>
  )
}
