'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
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
import 'prismjs/components/prism-markup-templating'  // required by php — must come first
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

const LANGUAGE_OPTIONS = [
  { value: '',           label: 'Plain text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'jsx',        label: 'JSX' },
  { value: 'tsx',        label: 'TSX' },
  { value: 'python',     label: 'Python' },
  { value: 'java',       label: 'Java' },
  { value: 'c',          label: 'C' },
  { value: 'cpp',        label: 'C++' },
  { value: 'csharp',     label: 'C#' },
  { value: 'go',         label: 'Go' },
  { value: 'rust',       label: 'Rust' },
  { value: 'kotlin',     label: 'Kotlin' },
  { value: 'swift',      label: 'Swift' },
  { value: 'ruby',       label: 'Ruby' },
  { value: 'php',        label: 'PHP' },
  { value: 'bash',       label: 'Bash / Shell' },
  { value: 'sql',        label: 'SQL' },
  { value: 'json',       label: 'JSON' },
  { value: 'yaml',       label: 'YAML' },
  { value: 'markup',     label: 'HTML / XML' },
]

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
  const stripped = text
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`([^`\n]+)`/g, '$1')
    .trim()
  return stripped || '[code block]'
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/`([^`\n]+)`/)
  if (parts.length === 1) return text
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <code key={i} className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-1.5 py-0.5 rounded text-[0.85em] font-mono">{part}</code>
          : part || null
      )}
    </>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlight(code: string, rawLang: string): string {
  try {
    const lang = LANG_ALIASES[rawLang] ?? rawLang
    const grammar = lang ? Prism.languages[lang] : undefined
    if (grammar) return Prism.highlight(code, grammar, lang)
  } catch {}
  return escapeHtml(code)
}

function CodeBlock({ code, lang, onLangChange }: {
  code: string
  lang: string
  onLangChange?: (lang: string) => void
}) {
  const [currentLang, setCurrentLang] = useState(() => LANG_ALIASES[lang] ?? lang)
  const [fullscreen, setFullscreen]   = useState(false)

  useEffect(() => {
    setCurrentLang(LANG_ALIASES[lang] ?? lang)
  }, [lang])

  function handleLangChange(newLang: string) {
    setCurrentLang(newLang)
    onLangChange?.(newLang)
  }

  const highlighted = highlight(code, currentLang)

  return (
    <>
      <div className="my-2 rounded-lg overflow-hidden border border-gray-700/50">
        <div className="px-3 py-1.5 bg-gray-800 flex items-center gap-2">
          <select
            value={currentLang}
            onChange={e => handleLangChange(e.target.value)}
            className="text-xs font-mono text-gray-400 bg-transparent border-none outline-none cursor-pointer hover:text-gray-200 transition-colors flex-1 min-w-0"
          >
            {LANGUAGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value} className="bg-gray-800 text-gray-300">
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0 p-0.5 rounded"
            title="Expand"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 4.5V1h3.5M8.5 1H12v3.5M12 8.5V12H8.5M4.5 12H1V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <pre className="overflow-x-auto overflow-y-auto max-h-72 bg-gray-900 p-3 m-0 text-[0.8rem] leading-relaxed text-gray-300">
          <code
            className={currentLang ? `language-${currentLang}` : undefined}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>

      {fullscreen && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="bg-gray-900 rounded-xl overflow-hidden w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-2 bg-gray-800 flex items-center gap-2 flex-shrink-0 border-b border-gray-700/50">
              <select
                value={currentLang}
                onChange={e => handleLangChange(e.target.value)}
                className="text-xs font-mono text-gray-400 bg-transparent border-none outline-none cursor-pointer hover:text-gray-200 transition-colors flex-1 min-w-0"
              >
                {LANGUAGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} className="bg-gray-800 text-gray-300">
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0 p-1 rounded"
                title="Close"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <pre className="overflow-auto flex-1 p-4 m-0 text-sm leading-relaxed text-gray-300 bg-gray-900">
              <code
                className={currentLang ? `language-${currentLang}` : undefined}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            </pre>
          </div>
        </div>
      )}
    </>
  )
}

interface Props {
  text: string
  className?: string
  onCodeLangChange?: (blockIndex: number, lang: string) => void
}

export function ContentRenderer({ text, className, onCodeLangChange }: Props) {
  const segments = parseSegments(text)
  const anyCode = segments.some(s => s.type === 'code')

  if (!anyCode) {
    return <>{renderInline(text)}</>
  }

  let codeIdx = 0
  return (
    <div className={className}>
      {segments.map((seg, i) => {
        if (seg.type === 'code') {
          const blockIndex = codeIdx++
          return (
            <CodeBlock
              key={i}
              code={seg.code}
              lang={seg.lang}
              onLangChange={onCodeLangChange ? lang => onCodeLangChange(blockIndex, lang) : undefined}
            />
          )
        }
        return seg.text.trim()
          ? <p key={i} className="mb-1 last:mb-0 whitespace-pre-wrap">{renderInline(seg.text)}</p>
          : null
      })}
    </div>
  )
}
