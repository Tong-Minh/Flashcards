'use client'

import { useRef, useState } from 'react'
import { ContentRenderer, hasFormattedContent } from '@/components/ContentRenderer'

interface SlashCommand {
  id:          string
  label:       string
  desc:        string
  icon:        string
  iconClass?:  string
  template:    string
  selectStart: number
  selectEnd:   number
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'code',   label: 'Code block', desc: 'Syntax-highlighted, scrollable', icon: '</>',                        template: '```language\n\n```',       selectStart: 3, selectEnd: 11 },
  { id: 'math',   label: 'Math',       desc: 'LaTeX equation (KaTeX)',          icon: '∑',                          template: '$$expression$$',           selectStart: 2, selectEnd: 12 },
  { id: 'h1',     label: 'Heading 1',  desc: 'Large title',                     icon: 'H1',                         template: '# Heading',                selectStart: 2, selectEnd: 9  },
  { id: 'h2',     label: 'Heading 2',  desc: 'Section title',                   icon: 'H2',                         template: '## Heading',               selectStart: 3, selectEnd: 10 },
  { id: 'h3',     label: 'Heading 3',  desc: 'Subsection title',                icon: 'H3',                         template: '### Heading',              selectStart: 4, selectEnd: 11 },
  { id: 'bold',   label: 'Bold',       desc: 'Bold text',                       icon: 'B',                          template: '**bold**',                 selectStart: 2, selectEnd: 6  },
  { id: 'italic', label: 'Italic',     desc: 'Italic text',                     icon: 'I',                          template: '*italic*',                 selectStart: 1, selectEnd: 7  },
  { id: 'red',    label: 'Red',        desc: 'Red text',    icon: '●', iconClass: 'text-red-500',    template: '[red]text[/red]',         selectStart: 5, selectEnd: 9  },
  { id: 'green',  label: 'Green',      desc: 'Green text',  icon: '●', iconClass: 'text-green-500',  template: '[green]text[/green]',     selectStart: 7, selectEnd: 11 },
  { id: 'blue',   label: 'Blue',       desc: 'Blue text',   icon: '●', iconClass: 'text-blue-500',   template: '[blue]text[/blue]',       selectStart: 6, selectEnd: 10 },
  { id: 'yellow', label: 'Yellow',     desc: 'Yellow text', icon: '●', iconClass: 'text-yellow-500', template: '[yellow]text[/yellow]',   selectStart: 8, selectEnd: 12 },
  { id: 'orange', label: 'Orange',     desc: 'Orange text', icon: '●', iconClass: 'text-orange-500', template: '[orange]text[/orange]',   selectStart: 8, selectEnd: 12 },
  { id: 'purple', label: 'Purple',     desc: 'Purple text', icon: '●', iconClass: 'text-purple-500', template: '[purple]text[/purple]',   selectStart: 8, selectEnd: 12 },
]

interface Props {
  value: string
  onChange: (val: string) => void
  rows?: number
  placeholder?: string
  className?: string
  hideHint?: boolean
}

export function RichTextarea({ value, onChange, rows = 3, placeholder, className, hideHint }: Props) {
  const ref       = useRef<HTMLTextAreaElement>(null)
  const [show,    setShow]    = useState(false)
  const [slashAt, setSlashAt] = useState(-1)
  const [filter,  setFilter]  = useState('')
  const [selIdx,  setSelIdx]  = useState(0)

  const filtered = !filter
    ? SLASH_COMMANDS
    : SLASH_COMMANDS.filter(c => c.id.startsWith(filter) || c.label.toLowerCase().startsWith(filter))

  const showPreview = hasFormattedContent(value)

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    const pos = e.target.selectionStart ?? val.length
    onChange(val)

    const lineStart   = val.lastIndexOf('\n', pos - 2) + 1
    const lineContent = val.slice(lineStart, pos)
    const slashMatch  = lineContent.match(/^\s*\/(\w*)$/)

    if (slashMatch) {
      setSlashAt(lineStart + lineContent.indexOf('/'))
      setFilter(slashMatch[1].toLowerCase())
      setSelIdx(0)
      setShow(true)
      return
    }
    setShow(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      if (show && filtered.length > 0) { insert(filtered[selIdx] ?? filtered[0]); return }
      const el  = e.currentTarget
      const s   = el.selectionStart ?? 0
      const end = el.selectionEnd   ?? 0
      const next = value.slice(0, s) + '  ' + value.slice(end)
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

  function handleLangChange(blockIndex: number, newLang: string) {
    let count = 0
    const next = value.replace(/```(\w*)\n/g, (match) => {
      if (count++ === blockIndex) return `\`\`\`${newLang}\n`
      return match
    })
    onChange(next)
  }

  function insert(command: SlashCommand) {
    if (slashAt < 0) return
    const commandLen = 1 + filter.length
    const before = value.slice(0, slashAt)
    const after  = value.slice(slashAt + commandLen)
    const next   = before + command.template + after
    onChange(next)
    setShow(false)
    setFilter('')
    setSelIdx(0)
    const start = before.length + command.selectStart
    const end   = before.length + command.selectEnd
    setTimeout(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(start, end)
    }, 0)
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />

      {/* Slash menu */}
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
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${
                  i === selIdx ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className={`flex-shrink-0 w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-xs font-semibold ${cmd.iconClass ?? 'text-gray-600 dark:text-gray-300'}`}>
                  {cmd.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cmd.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{cmd.desc}</p>
                </div>
                {i === selIdx && (
                  <span className="ml-auto text-xs text-gray-300 dark:text-gray-600 font-mono flex-shrink-0">↵</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hint */}
      {!hideHint && (
        <p className="mt-1 text-xs text-gray-300 dark:text-gray-600 select-none">
          Type <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">/</span> on a new line to insert a block
        </p>
      )}

      {/* Live preview — shown when rich formatting is present */}
      {showPreview && (
        <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-600 flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-gray-400 flex-shrink-0">
              <circle cx="5" cy="5" r="4.5" stroke="currentColor"/>
              <path d="M5 4v3M5 2.5v.5" stroke="currentColor" strokeLinecap="round"/>
            </svg>
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">Preview — this is how it appears during study</span>
          </div>
          <div className="px-4 py-3 bg-white dark:bg-gray-800">
            <ContentRenderer
              text={value}
              className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed"
              onCodeLangChange={handleLangChange}
            />
          </div>
        </div>
      )}
    </div>
  )
}
