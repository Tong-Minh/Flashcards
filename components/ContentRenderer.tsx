'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { tokenizeInline, tokensToPlainText, isMathBlockLine, matchImageLine, matchListLine, type InlineToken } from '@/lib/markup'
import { CardImage } from '@/components/CardImage'
import { normalizeLatex } from '@/lib/latex'
import Prism from 'prismjs'
import katex from 'katex'
import 'katex/dist/katex.min.css'
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
  { value: '',           label: 'Plain text'  },
  { value: 'javascript', label: 'JavaScript'  },
  { value: 'typescript', label: 'TypeScript'  },
  { value: 'jsx',        label: 'JSX'         },
  { value: 'tsx',        label: 'TSX'         },
  { value: 'python',     label: 'Python'      },
  { value: 'java',       label: 'Java'        },
  { value: 'c',          label: 'C'           },
  { value: 'cpp',        label: 'C++'         },
  { value: 'csharp',     label: 'C#'          },
  { value: 'go',         label: 'Go'          },
  { value: 'rust',       label: 'Rust'        },
  { value: 'kotlin',     label: 'Kotlin'      },
  { value: 'swift',      label: 'Swift'       },
  { value: 'ruby',       label: 'Ruby'        },
  { value: 'php',        label: 'PHP'         },
  { value: 'bash',       label: 'Bash / Shell'},
  { value: 'sql',        label: 'SQL'         },
  { value: 'json',       label: 'JSON'        },
  { value: 'yaml',       label: 'YAML'        },
  { value: 'markup',     label: 'HTML / XML'  },
]

export const COLOR_CLASSES: Record<string, string> = {
  red:    'text-red-500',
  green:  'text-green-600',
  blue:   'text-blue-500',
  yellow: 'text-yellow-500',
  orange: 'text-orange-500',
  purple: 'text-purple-500',
  pink:   'text-pink-500',
  gray:   'text-gray-500',
}

// ── Segment parser (code blocks vs text) ──────────────────────────────────────

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

export function hasFormattedContent(text: string): boolean {
  return (
    /```[\s\S]*?```/.test(text)         ||   // code block
    /\*[^*\n]+\*/.test(text)            ||   // bold / italic
    /^#{1,3} /m.test(text)              ||   // heading
    /\[\w+\][^\[]+\[\/\w+\]/.test(text) ||   // color
    /\$[^$\n]+\$/.test(text)            ||   // math
    /^\s*([-*]|\d+\.) /m.test(text)     ||   // list
    /^\s*!\[[^\]\n]*\]\(\S+\)\s*$/m.test(text) || // image
    /\\[*$\[\]`\\#.\-]/.test(text)           // escaped literal
  )
}

export function previewText(text: string): string {
  const stripped = text
    .replace(/```[\s\S]*?```/g, '[code]')
    .split('\n')
    .map(line => {
      const t = line.trimStart()
      if (t.startsWith('$$') && t.endsWith('$$') && t.length > 4) return '[math]'
      if (matchImageLine(t)) return '[image]'
      return tokensToPlainText(tokenizeInline(line.replace(/^\s*#{1,3} /, '')))
    })
    .join('\n')
    .trim()
  return stripped || '[code block]'
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async e => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(code)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {}
      }}
      className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0 px-1 rounded"
      title="Copy code"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function renderMath(expr: string, display: boolean): string {
  try {
    return katex.renderToString(normalizeLatex(expr.trim(), display), { throwOnError: false, displayMode: display, output: 'html' })
  } catch {
    return `<span class="font-mono text-sm">${escapeHtml(expr)}</span>`
  }
}

type MathClickHandler = (expr: string, display: boolean, rect: DOMRect) => void

function renderInline(text: string, onMathClick?: MathClickHandler): ReactNode {
  const tokens = tokenizeInline(text)
  if (tokens.length === 1 && tokens[0].t === 'text') return tokens[0].s
  return renderTokens(tokens, onMathClick)
}

function renderTokens(tokens: InlineToken[], onMathClick?: MathClickHandler): ReactNode {
  return (
    <>
      {tokens.map((tok, i) => {
        switch (tok.t) {
          case 'code':
            return <code key={i} className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-1.5 py-0.5 rounded text-[0.85em] font-mono">{tok.s}</code>
          case 'bold':
            return <strong key={i} className="font-semibold">{renderTokens(tok.children, onMathClick)}</strong>
          case 'italic':
            return <em key={i} className="italic">{renderTokens(tok.children, onMathClick)}</em>
          case 'color':
            return <span key={i} className={COLOR_CLASSES[tok.color] ?? ''}>{renderTokens(tok.children, onMathClick)}</span>
          case 'math': {
            // Rendered math can't wrap, so a long inline equation scrolls within the line instead of
            // widening the page on narrow screens
            // select-all + data-latex: highlighting takes the whole equation and copies its LaTeX (see CopyAsSource)
            const cls = tok.display
              ? 'block overflow-x-auto py-1 text-center select-all'
              : 'inline-block max-w-full overflow-x-auto overflow-y-hidden align-middle select-all'
            return (
              <span key={i}
                data-latex={tok.s}
                data-display={tok.display ? '' : undefined}
                className={onMathClick ? `${cls} cursor-pointer hover:opacity-70 transition-opacity` : cls}
                onClick={onMathClick ? (e) => { e.stopPropagation(); onMathClick(tok.s, tok.display, e.currentTarget.getBoundingClientRect()) } : undefined}
                dangerouslySetInnerHTML={{ __html: renderMath(tok.s, tok.display) }}
              />
            )
          }
          default:
            return tok.s || null
        }
      })}
    </>
  )
}

function renderTextBlock(text: string, blockKey: number, onMathClick?: MathClickHandler): ReactNode {
  const lines = text.split('\n')
  const nodes: ReactNode[] = []
  for (let j = 0; j < lines.length; j++) {
    const list = matchListLine(lines[j])
    if (list) {
      // Gather consecutive lines of the same list kind into one list
      const items: ReactNode[] = []
      let k = j
      for (let m: ReturnType<typeof matchListLine> = list; m && m.ordered === list.ordered; m = matchListLine(lines[++k] ?? '')) {
        items.push(<li key={k} className="leading-relaxed pl-0.5">{renderInline(m.text, onMathClick)}</li>)
      }
      nodes.push(list.ordered
        ? <ol key={j} start={list.start} className="list-decimal pl-6 my-1 space-y-0.5">{items}</ol>
        : <ul key={j} className="list-disc pl-6 my-1 space-y-0.5">{items}</ul>)
      j = k - 1
      continue
    }
    nodes.push(renderLine(lines[j], j, onMathClick))
  }
  return <div key={blockKey}>{nodes}</div>
}

function renderLine(line: string, j: number, onMathClick?: MathClickHandler): ReactNode {
  const trimmed = line.trimStart()
  if (trimmed.startsWith('### ')) return <h3 key={j} className="text-base font-bold mt-3 mb-0.5">{renderInline(trimmed.slice(4), onMathClick)}</h3>
  if (trimmed.startsWith('## '))  return <h2 key={j} className="text-lg  font-bold mt-3 mb-1">{renderInline(trimmed.slice(3), onMathClick)}</h2>
  if (trimmed.startsWith('# '))   return <h1 key={j} className="text-xl  font-bold mt-3 mb-1">{renderInline(trimmed.slice(2), onMathClick)}</h1>
  if (line === '')                return <br key={j} />
  const image = matchImageLine(trimmed)
  if (image) return <CardImage key={j} src={image.src} alt={image.alt} />
  if (isMathBlockLine(trimmed)) {
    const expr = trimmed.slice(2, -2)
    return (
      <div key={j}
        data-latex={expr}
        data-display=""
        className={`overflow-x-auto py-2 flex justify-center select-all${onMathClick ? ' cursor-pointer hover:opacity-70 transition-opacity' : ''}`}
        onClick={onMathClick ? (e) => { e.stopPropagation(); onMathClick(expr, true, e.currentTarget.getBoundingClientRect()) } : undefined}
        dangerouslySetInnerHTML={{ __html: renderMath(expr, true) }}
      />
    )
  }
  return <p key={j} className="leading-relaxed">{renderInline(line, onMathClick)}</p>
}

// ── Syntax highlighting ───────────────────────────────────────────────────────

export { LANG_ALIASES, LANGUAGE_OPTIONS }

export function highlight(code: string, rawLang: string): string {
  try {
    const lang = LANG_ALIASES[rawLang] ?? rawLang
    const grammar = lang ? Prism.languages[lang] : undefined
    if (grammar) return Prism.highlight(code, grammar, lang)
  } catch {}
  return escapeHtml(code)
}

// ── CodeBlock component ───────────────────────────────────────────────────────

function CodeBlock({ code, lang, readOnly, onLangChange }: {
  code: string
  lang: string
  readOnly?: boolean
  onLangChange?: (lang: string) => void
}) {
  const [currentLang, setCurrentLang] = useState(() => LANG_ALIASES[lang] ?? lang)
  const [fullscreen,  setFullscreen]  = useState(false)

  useEffect(() => {
    setCurrentLang(LANG_ALIASES[lang] ?? lang)
  }, [lang])

  function handleLangChange(newLang: string) {
    setCurrentLang(newLang)
    onLangChange?.(newLang)
  }

  const highlighted = highlight(code, currentLang)
  const langLabel   = LANGUAGE_OPTIONS.find(o => o.value === currentLang)?.label ?? (currentLang || 'Plain text')

  const langControl = (inFullscreen = false) => readOnly ? (
    <span className={`text-xs font-mono text-gray-400 flex-1 min-w-0 select-none ${inFullscreen ? '' : ''}`}>
      {langLabel}
    </span>
  ) : (
    <select
      value={currentLang}
      onChange={e => handleLangChange(e.target.value)}
      className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-transparent border-none outline-none cursor-pointer hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex-1 min-w-0"
    >
      {LANGUAGE_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value} className="bg-gray-800 text-gray-300">
          {opt.label}
        </option>
      ))}
    </select>
  )

  return (
    <>
      <div className="my-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700/50">
        <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 flex items-center gap-2">
          {langControl()}
          <CopyCodeButton code={code} />
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setFullscreen(true) }}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0 p-0.5 rounded"
            title="Expand"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 4.5V1h3.5M8.5 1H12v3.5M12 8.5V12H8.5M4.5 12H1V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <pre className="overflow-x-auto overflow-y-auto max-h-72 bg-gray-50 dark:bg-gray-900 p-3 m-0 text-[0.8rem] leading-relaxed text-gray-800 dark:text-gray-300">
          <code
            className={currentLang ? `language-${currentLang}` : undefined}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>

      {/* Portal escapes transformed ancestors (card flip animations) that would trap position:fixed.
          React events still bubble through portals, so stop them before they reach a card's flip handler. */}
      {fullscreen && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
          onClick={e => { e.stopPropagation(); setFullscreen(false) }}
          onPointerDown={e => e.stopPropagation()}
          onPointerMove={e => e.stopPropagation()}
          onPointerUp={e => e.stopPropagation()}
        >
          <div
            className="bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 flex items-center gap-2 flex-shrink-0 border-b border-gray-200 dark:border-gray-700/50">
              {langControl(true)}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setFullscreen(false) }}
                className="text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex-shrink-0 p-1 rounded"
                title="Close"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <pre className="overflow-auto flex-1 p-4 m-0 text-sm leading-relaxed text-gray-800 dark:text-gray-300 bg-gray-50 dark:bg-gray-900">
              <code
                className={currentLang ? `language-${currentLang}` : undefined}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            </pre>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ── ContentRenderer ───────────────────────────────────────────────────────────

interface Props {
  text: string
  className?: string
  readOnly?: boolean
  onCodeLangChange?: (blockIndex: number, lang: string) => void
  onInlineMathClick?: MathClickHandler
}

export function ContentRenderer({ text, className, readOnly, onCodeLangChange, onInlineMathClick }: Props) {
  const segments = parseSegments(text)
  const anyCode  = segments.some(s => s.type === 'code')

  if (!anyCode) {
    const hasBlocks = /^#{1,3} /m.test(text) || /^\$\$[\s\S]+?\$\$/m.test(text) ||
      text.split('\n').some(l => matchListLine(l) || matchImageLine(l.trimStart()))
    const content   = hasBlocks ? renderTextBlock(text, 0, onInlineMathClick) : renderInline(text, onInlineMathClick)
    if (className) return <div className={className}>{content}</div>
    return <>{content}</>
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
              readOnly={readOnly}
              onLangChange={onCodeLangChange ? lang => onCodeLangChange(blockIndex, lang) : undefined}
            />
          )
        }
        // The newline touching a code fence is a separator, not a blank line
        const text = seg.text
          .replace(segments[i - 1]?.type === 'code' ? /^\n/ : /^(?!)/, '')
          .replace(segments[i + 1]?.type === 'code' ? /\n$/ : /^(?!)/, '')
        return text.trim() ? renderTextBlock(text, i, onInlineMathClick) : null
      })}
    </div>
  )
}
