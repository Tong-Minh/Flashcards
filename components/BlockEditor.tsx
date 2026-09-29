'use client'

import { useRef, useState, useEffect } from 'react'
import katex from 'katex'
import { ContentRenderer, hasFormattedContent, highlight, escapeHtml, LANG_ALIASES, LANGUAGE_OPTIONS } from '@/components/ContentRenderer'

// ── Slash commands ────────────────────────────────────────────────────────────

interface SlashCommand {
  id: string; label: string; desc: string; icon: string; iconClass?: string
  blockType?: 'code' | 'math'
  template?: string; selectStart?: number; selectEnd?: number
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'code',   label: 'Code block', desc: 'Syntax-highlighted block',      icon: '</>',                        blockType: 'code' },
  { id: 'math',   label: 'Math',       desc: 'LaTeX display equation',         icon: '∑',                          blockType: 'math' },
  { id: 'h1',     label: 'Heading 1',  desc: 'Large title',                    icon: 'H1',                         template: '# Heading',              selectStart: 2,  selectEnd: 9  },
  { id: 'h2',     label: 'Heading 2',  desc: 'Section title',                  icon: 'H2',                         template: '## Heading',             selectStart: 3,  selectEnd: 10 },
  { id: 'h3',     label: 'Heading 3',  desc: 'Subsection title',               icon: 'H3',                         template: '### Heading',            selectStart: 4,  selectEnd: 11 },
  { id: 'bold',   label: 'Bold',       desc: 'Bold text',                      icon: 'B',                          template: '**bold**',               selectStart: 2,  selectEnd: 6  },
  { id: 'italic', label: 'Italic',     desc: 'Italic text',                    icon: 'I',                          template: '*italic*',               selectStart: 1,  selectEnd: 7  },
  { id: 'red',    label: 'Red',        desc: 'Red text',  icon: '●', iconClass: 'text-red-500',    template: '[red]text[/red]',       selectStart: 5,  selectEnd: 9  },
  { id: 'green',  label: 'Green',      desc: 'Green text',icon: '●', iconClass: 'text-green-500',  template: '[green]text[/green]',   selectStart: 7,  selectEnd: 11 },
  { id: 'blue',   label: 'Blue',       desc: 'Blue text', icon: '●', iconClass: 'text-blue-500',   template: '[blue]text[/blue]',     selectStart: 6,  selectEnd: 10 },
  { id: 'yellow', label: 'Yellow',     desc: 'Yellow text',icon:'●', iconClass: 'text-yellow-500', template: '[yellow]text[/yellow]', selectStart: 8,  selectEnd: 12 },
  { id: 'orange', label: 'Orange',     desc: 'Orange text',icon:'●', iconClass: 'text-orange-500', template: '[orange]text[/orange]', selectStart: 8,  selectEnd: 12 },
  { id: 'purple', label: 'Purple',     desc: 'Purple text',icon:'●', iconClass: 'text-purple-500', template: '[purple]text[/purple]', selectStart: 8,  selectEnd: 12 },
]

// ── Block types ───────────────────────────────────────────────────────────────

type TextBlock = { id: string; type: 'text'; content: string }
type CodeBlock = { id: string; type: 'code'; lang: string; content: string }
type MathBlock = { id: string; type: 'math'; content: string }
type Block = TextBlock | CodeBlock | MathBlock

let _idCtr = 0
const uid = () => `b${++_idCtr}`

// ── Parse / Serialize ─────────────────────────────────────────────────────────

function splitTextByMath(text: string, out: Block[]) {
  const re = /(?:^|\n)\$\$([\s\S]*?)\$\$(?=\n|$)/gm
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const nl = m[0].startsWith('\n')
    const before = text.slice(last, m.index + (nl ? 1 : 0))
    if (before) out.push({ id: uid(), type: 'text', content: before })
    out.push({ id: uid(), type: 'math', content: m[1].trim() })
    last = m.index + m[0].length
  }
  const remaining = text.slice(last)
  if (remaining) out.push({ id: uid(), type: 'text', content: remaining })
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const re = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) splitTextByMath(text.slice(last, m.index), blocks)
    blocks.push({ id: uid(), type: 'code', lang: m[1] || '', content: m[2].replace(/\n$/, '') })
    last = m.index + m[0].length
  }
  if (last < text.length) splitTextByMath(text.slice(last), blocks)
  if (blocks.length === 0) blocks.push({ id: uid(), type: 'text', content: text })
  return blocks
}

function serializeBlocks(blocks: Block[]): string {
  let result = ''
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.type === 'code') {
      result += `\`\`\`${b.lang}\n${b.content}\n\`\`\``
    } else if (b.type === 'math') {
      if (result && !result.endsWith('\n')) result += '\n'
      result += `$$${b.content}$$`
      const next = blocks[i + 1]
      if (next && next.type === 'text' && !next.content.startsWith('\n')) result += '\n'
    } else {
      result += b.content
    }
  }
  return result
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function renderKatex(expr: string): string {
  try {
    return katex.renderToString(expr.trim(), { throwOnError: false, displayMode: true, output: 'html' })
  } catch {
    return `<span class="font-mono text-sm">${escapeHtml(expr)}</span>`
  }
}

// ── TextBlockArea ─────────────────────────────────────────────────────────────

interface TextBlockAreaProps {
  content: string
  placeholder?: string
  textareaClassName?: string
  minRows: number
  hideHint: boolean
  isFirst: boolean
  shouldFocus: boolean
  onFocused: () => void
  onChange: (content: string) => void
  onInsertBlock: (before: string, after: string, blockType: 'code' | 'math') => void
}

function TextBlockArea({
  content, placeholder, textareaClassName, minRows, hideHint, isFirst,
  shouldFocus, onFocused, onChange, onInsertBlock,
}: TextBlockAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [show, setShow] = useState(false)
  const [slashAt, setSlashAt] = useState(-1)
  const [filter, setFilter] = useState('')
  const [selIdx, setSelIdx] = useState(0)

  const filtered = !filter
    ? SLASH_COMMANDS
    : SLASH_COMMANDS.filter(c => c.id.startsWith(filter) || c.label.toLowerCase().startsWith(filter))

  const showPreview = hasFormattedContent(content) && !/```/.test(content)

  useEffect(() => {
    autoResize(ref.current)
  }, [content])

  useEffect(() => {
    if (!shouldFocus || !ref.current) return
    ref.current.focus()
    const len = ref.current.value.length
    ref.current.setSelectionRange(len, len)
    onFocused()
  }, [shouldFocus])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    const pos = e.target.selectionStart ?? val.length
    onChange(val)
    const lineStart = val.lastIndexOf('\n', pos - 2) + 1
    const lineContent = val.slice(lineStart, pos)
    const slashMatch = lineContent.match(/^\s*\/(\w*)$/)
    if (slashMatch) {
      setSlashAt(lineStart + lineContent.indexOf('/'))
      setFilter(slashMatch[1].toLowerCase())
      setSelIdx(0)
      setShow(true)
    } else {
      setShow(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      if (show && filtered.length > 0) { insert(filtered[selIdx] ?? filtered[0]); return }
      const el = e.currentTarget
      const s = el.selectionStart ?? 0
      const end = el.selectionEnd ?? 0
      const next = content.slice(0, s) + '  ' + content.slice(end)
      onChange(next)
      setTimeout(() => el.setSelectionRange(s + 2, s + 2), 0)
      return
    }
    if (!show) return
    if (e.key === 'Escape')    { e.preventDefault(); setShow(false); setFilter(''); setSelIdx(0) }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (filtered.length > 0) insert(filtered[selIdx] ?? filtered[0]) }
  }

  function insert(command: SlashCommand) {
    if (slashAt < 0) return
    const commandLen = 1 + filter.length
    setShow(false); setFilter(''); setSelIdx(0)

    if (command.blockType) {
      const before = content.slice(0, slashAt)
      const after  = content.slice(slashAt + commandLen).replace(/^\n/, '')
      onInsertBlock(before, after, command.blockType)
      return
    }

    const before = content.slice(0, slashAt)
    const after  = content.slice(slashAt + commandLen)
    const next   = before + command.template! + after
    onChange(next)
    const start = before.length + command.selectStart!
    const end   = before.length + command.selectEnd!
    setTimeout(() => { ref.current?.focus(); ref.current?.setSelectionRange(start, end) }, 0)
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        placeholder={isFirst ? placeholder : undefined}
        className={textareaClassName}
        style={{ overflow: 'hidden', resize: 'none', minHeight: `${minRows * 1.625}rem` }}
        rows={minRows}
      />

      {show && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
          {filter && (
            <div className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 font-mono">
              /{filter}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto">
            {filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); insert(cmd) }}
                onMouseEnter={() => setSelIdx(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${i === selIdx ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                <span className={`flex-shrink-0 w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-xs font-semibold ${cmd.iconClass ?? 'text-gray-600 dark:text-gray-300'}`}>
                  {cmd.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cmd.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{cmd.desc}</p>
                </div>
                {i === selIdx && <span className="ml-auto text-xs text-gray-300 dark:text-gray-600 font-mono flex-shrink-0">↵</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hideHint && isFirst && (
        <p className="mt-1 text-xs text-gray-300 dark:text-gray-600 select-none">
          Type <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">/</span> on a new line to insert a block
        </p>
      )}

      {showPreview && (
        <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-600 flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-gray-400 flex-shrink-0">
              <circle cx="5" cy="5" r="4.5" stroke="currentColor"/>
              <path d="M5 4v3M5 2.5v.5" stroke="currentColor" strokeLinecap="round"/>
            </svg>
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">Preview</span>
          </div>
          <div className="px-4 py-3 bg-white dark:bg-gray-800">
            <ContentRenderer text={content} className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed" readOnly />
          </div>
        </div>
      )}
    </div>
  )
}

// ── CodeBlockCard ─────────────────────────────────────────────────────────────

interface CodeBlockCardProps {
  block: CodeBlock
  initialEditing: boolean
  onChange: (patch: Partial<Omit<CodeBlock, 'id' | 'type'>>) => void
  onDelete: () => void
}

function CodeBlockCard({ block, initialEditing, onChange, onDelete }: CodeBlockCardProps) {
  const [editing, setEditing] = useState(initialEditing)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      taRef.current?.focus()
      autoResize(taRef.current)
    }
  }, [editing])

  useEffect(() => {
    if (editing) autoResize(taRef.current)
  }, [block.content])

  const resolvedLang = LANG_ALIASES[block.lang] ?? block.lang
  const highlighted  = highlight(block.content, resolvedLang)
  const langLabel    = LANGUAGE_OPTIONS.find(o => o.value === resolvedLang)?.label ?? (resolvedLang || 'Plain text')

  const header = (
    <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700/50">
      {editing ? (
        <select
          value={block.lang}
          onChange={e => onChange({ lang: e.target.value })}
          className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-transparent border-none outline-none cursor-pointer hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex-1 min-w-0"
        >
          {LANGUAGE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-gray-800 text-gray-300">{opt.label}</option>
          ))}
        </select>
      ) : (
        <span className="text-xs font-mono text-gray-400 flex-1 min-w-0 select-none">{langLabel}</span>
      )}
      <div className="flex items-center gap-1 flex-shrink-0">
        {editing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          title="Delete block"
          className="p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700/50">
      {header}
      {editing ? (
        <textarea
          ref={taRef}
          value={block.content}
          onChange={e => onChange({ content: e.target.value })}
          onKeyDown={e => {
            if (e.key === 'Tab') {
              e.preventDefault()
              const el = e.currentTarget
              const s = el.selectionStart, end = el.selectionEnd
              const next = block.content.slice(0, s) + '  ' + block.content.slice(end)
              onChange({ content: next })
              setTimeout(() => el.setSelectionRange(s + 2, s + 2), 0)
            }
          }}
          className="w-full font-mono text-[0.8rem] leading-relaxed p-3 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-300 outline-none border-none"
          style={{ overflow: 'hidden', resize: 'none', minHeight: '4rem' }}
          spellCheck={false}
          placeholder="Type code here…"
        />
      ) : (
        <pre
          className="overflow-x-auto overflow-y-auto max-h-72 bg-gray-50 dark:bg-gray-900 p-3 m-0 text-[0.8rem] leading-relaxed text-gray-800 dark:text-gray-300 cursor-pointer"
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          <code
            className={resolvedLang ? `language-${resolvedLang}` : undefined}
            dangerouslySetInnerHTML={{ __html: highlighted || '<span class="text-gray-400 dark:text-gray-600 italic select-none">empty — click to edit</span>' }}
          />
        </pre>
      )}
    </div>
  )
}

// ── MathBlockCard ─────────────────────────────────────────────────────────────

interface MathBlockCardProps {
  block: MathBlock
  initialEditing: boolean
  onChange: (content: string) => void
  onDelete: () => void
}

function MathBlockCard({ block, initialEditing, onChange, onDelete }: MathBlockCardProps) {
  const [editing, setEditing] = useState(initialEditing)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const rendered = renderKatex(block.content || 'expression')

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700/50">
      <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700/50">
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 flex-1 select-none">Math (LaTeX)</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            title="Delete block"
            className="p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      {editing ? (
        <div className="px-3 py-2 bg-white dark:bg-gray-900 flex items-center gap-2">
          <span className="text-gray-400 dark:text-gray-500 font-mono text-sm select-none">$$</span>
          <input
            ref={inputRef}
            type="text"
            value={block.content}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setEditing(false) } }}
            placeholder="E = mc^2"
            className="flex-1 font-mono text-sm text-gray-800 dark:text-gray-300 bg-transparent outline-none border-none placeholder-gray-300 dark:placeholder-gray-600"
            spellCheck={false}
          />
          <span className="text-gray-400 dark:text-gray-500 font-mono text-sm select-none">$$</span>
        </div>
      ) : (
        <div
          className="px-3 py-3 bg-gray-50 dark:bg-gray-900 flex justify-center overflow-x-auto cursor-pointer"
          onClick={() => setEditing(true)}
          title="Click to edit"
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )}
    </div>
  )
}

// ── BlockEditor ───────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (val: string) => void
  rows?: number
  placeholder?: string
  className?: string
  hideHint?: boolean
}

export function BlockEditor({ value, onChange, rows = 3, placeholder, className, hideHint }: Props) {
  const [blocks, setBlocks] = useState(() => parseBlocks(value))
  const [focusId, setFocusId] = useState<string | null>(null)
  const lastSerial = useRef(value)

  useEffect(() => {
    if (value !== lastSerial.current) {
      setBlocks(parseBlocks(value))
      lastSerial.current = value
    }
  }, [value])

  function commit(next: Block[]) {
    const serial = serializeBlocks(next)
    lastSerial.current = serial
    setBlocks(next)
    onChange(serial)
  }

  function updateBlock(id: string, patch: object) {
    commit(blocks.map(b => b.id === id ? { ...b, ...patch } : b))
  }

  function deleteBlock(id: string) {
    const filtered = blocks.filter(b => b.id !== id)
    const merged: Block[] = []
    for (const b of filtered) {
      const prev = merged[merged.length - 1]
      if (b.type === 'text' && prev?.type === 'text') {
        merged[merged.length - 1] = { ...prev, content: prev.content + b.content }
      } else {
        merged.push(b)
      }
    }
    if (merged.length === 0) merged.push({ id: uid(), type: 'text', content: '' })
    commit(merged)
  }

  function insertBlock(afterId: string, before: string, after: string, blockType: 'code' | 'math') {
    const idx = blocks.findIndex(b => b.id === afterId)
    if (idx < 0) return

    const newId    = uid()
    const afterId2 = uid()
    const newBlock: Block = blockType === 'code'
      ? { id: newId, type: 'code', lang: '', content: '' }
      : { id: newId, type: 'math', content: '' }
    const afterBlock: TextBlock = { id: afterId2, type: 'text', content: after }

    const next = [
      ...blocks.slice(0, idx),
      { ...blocks[idx] as TextBlock, content: before },
      newBlock,
      afterBlock,
      ...blocks.slice(idx + 1),
    ]
    const serial = serializeBlocks(next)
    lastSerial.current = serial
    setBlocks(next)
    onChange(serial)
    setFocusId(afterId2)
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        const isFirst = idx === 0

        if (block.type === 'text') {
          return (
            <TextBlockArea
              key={block.id}
              content={block.content}
              placeholder={placeholder}
              textareaClassName={className}
              minRows={isFirst ? rows : 1}
              hideHint={!!hideHint}
              isFirst={isFirst}
              shouldFocus={focusId === block.id}
              onFocused={() => setFocusId(null)}
              onChange={content => updateBlock(block.id, { content })}
              onInsertBlock={(before, after, bt) => insertBlock(block.id, before, after, bt)}
            />
          )
        }

        if (block.type === 'code') {
          return (
            <CodeBlockCard
              key={block.id}
              block={block}
              initialEditing={block.content === ''}
              onChange={patch => updateBlock(block.id, patch)}
              onDelete={() => deleteBlock(block.id)}
            />
          )
        }

        if (block.type === 'math') {
          return (
            <MathBlockCard
              key={block.id}
              block={block}
              initialEditing={block.content === ''}
              onChange={content => updateBlock(block.id, { content })}
              onDelete={() => deleteBlock(block.id)}
            />
          )
        }

        return null
      })}
    </div>
  )
}
