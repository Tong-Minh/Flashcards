'use client'

import { useRef, useState, useEffect } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { NodeSelection, Selection } from '@tiptap/pm/state'
import { highlight, LANG_ALIASES, LANGUAGE_OPTIONS } from '@/components/ContentRenderer'
import { buildExtensions } from '@/components/editor/extensions'
import { parseMarkup, serializeMarkup } from '@/lib/markup'

// ── Slash commands ─────────────────────────────────────────────────────────────

type CommandKind =
  | { kind: 'code' }
  | { kind: 'math' }
  | { kind: 'mathBlock' }
  | { kind: 'list'; ordered: boolean }
  | { kind: 'heading'; level: 1 | 2 | 3 }
  | { kind: 'mark'; mark: 'bold' | 'italic' | 'code' }
  | { kind: 'color'; color: string }
  | { kind: 'clear' }

type SlashCommand = { id: string; label: string; desc: string; icon: string; iconClass?: string } & CommandKind

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'code',   label: 'Code block', desc: 'Syntax-highlighted block', icon: '</>', kind: 'code' },
  { id: 'math',   label: 'Math',       desc: 'Inline LaTeX equation',    icon: '∑',   kind: 'math' },
  { id: 'mathblock', label: 'Math block', desc: 'Centered equation on its own line', icon: '∑̲', kind: 'mathBlock' },
  { id: 'bullet', label: 'Bulleted list', desc: 'Simple bullet points',  icon: '•',   kind: 'list', ordered: false },
  { id: 'numbered', label: 'Numbered list', desc: 'List with numbers',   icon: '1.',  kind: 'list', ordered: true },
  { id: 'h1',     label: 'Heading 1',  desc: 'Large title',              icon: 'H1',  kind: 'heading', level: 1 },
  { id: 'h2',     label: 'Heading 2',  desc: 'Section title',            icon: 'H2',  kind: 'heading', level: 2 },
  { id: 'h3',     label: 'Heading 3',  desc: 'Subsection title',         icon: 'H3',  kind: 'heading', level: 3 },
  { id: 'bold',   label: 'Bold',       desc: 'Bold text',                icon: 'B',   kind: 'mark', mark: 'bold' },
  { id: 'italic', label: 'Italic',     desc: 'Italic text',              icon: 'I',   kind: 'mark', mark: 'italic' },
  { id: 'inline', label: 'Inline code', desc: 'Code within a sentence',  icon: '`',   kind: 'mark', mark: 'code' },
  { id: 'red',    label: 'Red',        desc: 'Red text',    icon: '●', iconClass: 'text-red-500',    kind: 'color', color: 'red' },
  { id: 'green',  label: 'Green',      desc: 'Green text',  icon: '●', iconClass: 'text-green-500',  kind: 'color', color: 'green' },
  { id: 'blue',   label: 'Blue',       desc: 'Blue text',   icon: '●', iconClass: 'text-blue-500',   kind: 'color', color: 'blue' },
  { id: 'yellow', label: 'Yellow',     desc: 'Yellow text', icon: '●', iconClass: 'text-yellow-500', kind: 'color', color: 'yellow' },
  { id: 'orange', label: 'Orange',     desc: 'Orange text', icon: '●', iconClass: 'text-orange-500', kind: 'color', color: 'orange' },
  { id: 'purple', label: 'Purple',     desc: 'Purple text', icon: '●', iconClass: 'text-purple-500', kind: 'color', color: 'purple' },
  { id: 'clear',  label: 'Clear formatting', desc: 'Back to plain text', icon: 'T̸', kind: 'clear' },
]

const TOOLBAR_COLORS = [
  { color: 'red',    className: 'bg-red-500'    },
  { color: 'green',  className: 'bg-green-600'  },
  { color: 'blue',   className: 'bg-blue-500'   },
  { color: 'yellow', className: 'bg-yellow-500' },
  { color: 'orange', className: 'bg-orange-500' },
  { color: 'purple', className: 'bg-purple-500' },
]

// Toggle a color: same color again removes it, a different color replaces it.
// With an empty selection this sets the format for the next typed text (stored marks).
function toggleColor(editor: Editor, color: string) {
  if (editor.isActive('color', { color })) editor.chain().focus().unsetMark('color').run()
  else editor.chain().focus().setMark('color', { color }).run()
}

function applyCommand(editor: Editor, cmd: SlashCommand) {
  switch (cmd.kind) {
    case 'math':    editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: '' } }).run(); break
    case 'mathBlock': {
      // On an empty line, replace the line itself so no blank paragraph is left above the equation
      const { $from } = editor.state.selection
      const emptyLine = $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0
      const block = { type: 'mathBlock', attrs: { latex: '' } }
      if (emptyLine) editor.chain().focus().insertContentAt({ from: $from.before(), to: $from.after() }, block).run()
      else editor.chain().focus().insertContent(block).run()
      break
    }
    case 'list':    editor.chain().focus()[cmd.ordered ? 'toggleOrderedList' : 'toggleBulletList']().run(); break
    case 'heading': editor.chain().focus().toggleHeading({ level: cmd.level }).run(); break
    case 'mark':    editor.chain().focus().toggleMark(cmd.mark).run(); break
    case 'color':   toggleColor(editor, cmd.color); break
    case 'clear':   clearFormatting(editor); break
  }
}

// Plain text from here on: drop marks on the selection and the ones that would carry into the
// next typed text (stored marks), and turn a heading line back into a paragraph.
function clearFormatting(editor: Editor) {
  editor.chain().focus()
    .unsetAllMarks()
    .command(({ tr }) => { tr.setStoredMarks([]); return true })
    .run()
  if (editor.isActive('heading')) editor.chain().focus().setParagraph().run()
}

// ── Block types ────────────────────────────────────────────────────────────────

// `lead` / `trail`: the text had a newline separating it from an adjacent code fence. That
// newline is structural, not a blank line, so it's kept out of the editor and re-added on save.
type TextBlock = { id: string; type: 'text'; content: string; lead?: boolean; trail?: boolean }
type CodeBlock = { id: string; type: 'code'; lang: string; content: string }
type Block = TextBlock | CodeBlock

let _idCtr = 0
const uid = () => `b${++_idCtr}`

// ── Parse / Serialize ──────────────────────────────────────────────────────────

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const re = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) blocks.push({ id: uid(), type: 'text', content: text.slice(last, m.index) })
    blocks.push({ id: uid(), type: 'code', lang: m[1] || '', content: m[2].replace(/\n$/, '') })
    last = m.index + m[0].length
  }
  if (last < text.length) blocks.push({ id: uid(), type: 'text', content: text.slice(last) })
  if (blocks.length === 0) blocks.push({ id: uid(), type: 'text', content: text })

  blocks.forEach((b, i) => {
    if (b.type !== 'text') return
    if (blocks[i + 1]?.type === 'code' && b.content.endsWith('\n'))   { b.content = b.content.slice(0, -1); b.trail = true }
    if (blocks[i - 1]?.type === 'code' && b.content.startsWith('\n')) { b.content = b.content.slice(1);     b.lead  = true }
  })
  return withTextAfterCode(blocks)
}

// Every code block gets a text block after it (empty if need be) so there is always a place to
// click below it to keep writing. Empty text blocks serialize to nothing.
function withTextAfterCode(blocks: Block[]): Block[] {
  const out: Block[] = []
  blocks.forEach((b, i) => {
    out.push(b)
    if (b.type === 'code' && blocks[i + 1]?.type !== 'text') out.push({ id: uid(), type: 'text', content: '' })
  })
  return out
}

const rawText = (b: TextBlock) => `${b.lead ? '\n' : ''}${b.content}${b.trail ? '\n' : ''}`

function serializeBlocks(blocks: Block[]): string {
  return blocks.map(b =>
    b.type === 'code' ? `\`\`\`${b.lang}\n${b.content}\n\`\`\`` : rawText(b)
  ).join('')
}

function mergeTextBlocks(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    const prev = out[out.length - 1]
    if (b.type === 'text' && prev?.type === 'text') {
      // Separators between the two halves become real text; the outer ones stay separators
      const inner = `${prev.content}${prev.trail ? '\n' : ''}${b.lead ? '\n' : ''}${b.content}`
      out[out.length - 1] = { ...prev, content: inner, trail: b.trail }
    } else {
      out.push(b)
    }
  }
  return out
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// ── RichTextBlock ──────────────────────────────────────────────────────────────

interface RichTextBlockProps {
  content: string
  placeholder?: string
  minRows: number
  isFirst: boolean
  singleLine?: boolean
  focusAt: 'start' | 'end' | null
  onFocused: () => void
  onChange: (content: string) => void
  onInsertBlock: (before: string, after: string) => void
  // Backspace with the cursor at the very start; return true if handled (e.g. a code block above)
  onBackspaceAtStart?: () => boolean
  onOtherKey?: () => void
}

type SlashState = { from: number; filter: string; top: number; left: number }
type ToolbarState = { top: number; left: number }

function RichTextBlock({
  content, placeholder, minRows, isFirst, singleLine,
  focusAt, onFocused, onChange, onInsertBlock, onBackspaceAtStart, onOtherKey,
}: RichTextBlockProps) {
  const keyCallbacks = useRef({ onBackspaceAtStart, onOtherKey })
  keyCallbacks.current = { onBackspaceAtStart, onOtherKey }
  const containerRef = useRef<HTMLDivElement>(null)
  const lastEmitted  = useRef(content)
  // The editor captures its callbacks once; route through refs so the latest props are used
  const onChangeRef      = useRef(onChange)
  const onInsertBlockRef = useRef(onInsertBlock)
  onChangeRef.current      = onChange
  onInsertBlockRef.current = onInsertBlock
  const [slash,   setSlash]   = useState<SlashState | null>(null)
  const [selIdx,  setSelIdx]  = useState(0)
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null)
  const [, forceRender] = useState(0)

  const blockOnly = ['code', 'heading', 'mathBlock', 'list']
  const commands = singleLine ? SLASH_COMMANDS.filter(c => !blockOnly.includes(c.kind)) : SLASH_COMMANDS
  const menuListRef = useRef<HTMLDivElement>(null)

  // Keep the keyboard-highlighted command visible in the scrollable menu
  useEffect(() => {
    menuListRef.current?.querySelector<HTMLElement>(`[data-idx="${selIdx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selIdx])
  const filtered = !slash?.filter
    ? commands
    : commands.filter(c => c.id.startsWith(slash.filter) || c.label.toLowerCase().startsWith(slash.filter))

  // Key handling runs inside ProseMirror's handler, so it reads the latest menu state through a ref
  const menuRef = useRef({ slash, filtered, selIdx })
  menuRef.current = { slash, filtered, selIdx }

  function relativeCoords(editor: Editor, pos: number, edge: 'top' | 'bottom') {
    const c  = editor.view.coordsAtPos(pos)
    const cr = containerRef.current?.getBoundingClientRect()
    if (!cr) return { top: 0, left: 0 }
    return { top: (edge === 'top' ? c.top : c.bottom) - cr.top, left: Math.max(0, Math.min(c.left - cr.left, cr.width - 260)) }
  }

  function updateMenus(editor: Editor) {
    const { selection } = editor.state
    const { $from, empty } = selection

    // Slash menu: "/" at line start or after whitespace, followed by an optional filter word
    if (empty && editor.isFocused) {
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
      const m = before.match(/(^|\s)\/(\w*)$/)
      if (m) {
        const from   = $from.pos - (m[2].length + 1)
        const filter = m[2].toLowerCase()
        const { top, left } = relativeCoords(editor, from, 'bottom')
        if (menuRef.current.slash?.filter !== filter) setSelIdx(0)
        setSlash({ from, filter, top: top + 4, left })
      } else {
        setSlash(null)
      }
    } else {
      setSlash(null)
    }

    // Selection toolbar: shown below a non-empty text selection (below so it doesn't fight
    // the native copy/paste bubble on phones, which appears above)
    if (!empty && editor.isFocused && !(selection instanceof NodeSelection)) {
      const { top, left } = relativeCoords(editor, selection.to, 'bottom')
      setToolbar({ top: top + 6, left })
    } else {
      setToolbar(null)
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: buildExtensions({ singleLine, placeholder: isFirst ? placeholder : undefined }),
    content: parseMarkup(content, { singleLine }),
    editorProps: {
      attributes: {
        class: 'tiptap-card-editor focus:outline-none text-gray-900 dark:text-gray-100 leading-relaxed',
      },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Backspace') keyCallbacks.current.onOtherKey?.()
        const sel = view.state.selection
        if (event.key === 'Backspace' && sel.empty && sel.from === Selection.atStart(view.state.doc).from
            && keyCallbacks.current.onBackspaceAtStart?.()) return true
        const { slash: s, filtered: f, selIdx: i } = menuRef.current
        if (s && f.length > 0) {
          if (event.key === 'ArrowDown') { setSelIdx(Math.min(i + 1, f.length - 1)); return true }
          if (event.key === 'ArrowUp')   { setSelIdx(Math.max(i - 1, 0)); return true }
          if (event.key === 'Enter' || event.key === 'Tab') { runSlash(f[i] ?? f[0]); return true }
          if (event.key === 'Escape')    { setSlash(null); return true }
        }
        if (event.key === 'Tab') { editorRef.current?.commands.insertContent('  '); return true }
        if (event.key === 'Enter' && singleLine) return true
        return false
      },
    },
    onUpdate: ({ editor }) => {
      const serial = serializeMarkup(editor.getJSON())
      lastEmitted.current = serial
      onChangeRef.current(serial)
      updateMenus(editor)
    },
    onSelectionUpdate: ({ editor }) => { updateMenus(editor); forceRender(n => n + 1) },
    onTransaction:     () => forceRender(n => n + 1),   // keeps toolbar active-states fresh
    onFocus:           ({ editor }) => updateMenus(editor),
    onBlur:            () => { setSlash(null); setToolbar(null) },
  })

  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor

  // Content replaced from outside (e.g. the card finished loading): reset without emitting a change
  useEffect(() => {
    if (!editor || content === lastEmitted.current) return
    lastEmitted.current = content
    editor.commands.setContent(parseMarkup(content, { singleLine }), { emitUpdate: false })
  }, [content, editor, singleLine])

  useEffect(() => {
    if (!focusAt || !editor) return
    editor.commands.focus(focusAt)
    onFocused()
  }, [focusAt, editor])

  function runSlash(cmd: SlashCommand) {
    const ed = editorRef.current
    const s  = menuRef.current.slash
    if (!ed || !s) return
    setSlash(null)
    const to = ed.state.selection.from
    ed.chain().focus().deleteRange({ from: s.from, to }).run()

    if (cmd.kind === 'code') {
      // Split this text block at the cursor; BlockEditor inserts a code card between the halves
      const pos    = ed.state.selection.from
      const before = serializeMarkup(ed.state.doc.cut(0, pos).toJSON()).replace(/\n$/, '')
      const after  = serializeMarkup(ed.state.doc.cut(pos).toJSON()).replace(/^\n/, '')
      onInsertBlockRef.current(before, after)
      return
    }
    applyCommand(ed, cmd)
  }

  const minHeight = singleLine ? undefined : `${minRows * 1.625}rem`

  return (
    <div
      ref={containerRef}
      className={`relative cursor-text ${singleLine ? '' : 'px-4'}`}
      style={singleLine ? undefined : { paddingTop: isFirst ? '0.75rem' : '0.5rem', paddingBottom: '0.5rem' }}
      onClick={e => { if (e.target === e.currentTarget) editor?.commands.focus('end') }}
    >
      <EditorContent editor={editor} style={{ minHeight }} />

      {slash && filtered.length > 0 && (
        <div
          className="absolute z-50 w-64 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden"
          style={{ top: slash.top, left: slash.left }}
        >
          {slash.filter && (
            <div className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 font-mono">
              /{slash.filter}
            </div>
          )}
          <div ref={menuListRef} className="max-h-64 overflow-y-auto">
            {filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                data-idx={i}
                type="button"
                onMouseDown={e => { e.preventDefault(); runSlash(cmd) }}
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

      {toolbar && editor && (
        <div
          className="absolute z-50 flex items-center gap-0.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg shadow-lg px-1 py-1"
          style={{ top: toolbar.top, left: toolbar.left }}
          onMouseDown={e => e.preventDefault()}   // keep the text selection
        >
          <ToolbarButton active={editor.isActive('bold')}   onClick={() => editor.chain().focus().toggleBold().run()}   label="Bold"><b>B</b></ToolbarButton>
          <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic"><i className="font-serif">I</i></ToolbarButton>
          <ToolbarButton active={editor.isActive('code')}   onClick={() => editor.chain().focus().toggleCode().run()}   label="Inline code"><span className="font-mono text-xs">&lt;/&gt;</span></ToolbarButton>
          {!singleLine && ([1, 2, 3] as const).map(level => (
            <ToolbarButton key={level} active={editor.isActive('heading', { level })} onClick={() => editor.chain().focus().toggleHeading({ level }).run()} label={`Heading ${level}`}>
              <span className="text-xs font-bold">H{level}</span>
            </ToolbarButton>
          ))}
          <span className="w-px h-5 bg-white/20 mx-0.5" />
          {TOOLBAR_COLORS.map(({ color, className }) => (
            <button
              key={color}
              type="button"
              onClick={() => toggleColor(editor, color)}
              title={color}
              className={`w-5 h-5 m-0.5 rounded-full ${className} ${editor.isActive('color', { color }) ? 'ring-2 ring-white' : ''}`}
            />
          ))}
          <span className="w-px h-5 bg-white/20 mx-0.5" />
          <ToolbarButton
            active={false}
            label="Make math"
            onClick={() => {
              const { from, to } = editor.state.selection
              const latex = editor.state.doc.textBetween(from, to, ' ')
              editor.chain().focus().insertContentAt({ from, to }, { type: 'mathInline', attrs: { latex } }).run()
            }}
          >
            ∑
          </ToolbarButton>
          <ToolbarButton active={false} label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().run()}>
            <span className="text-xs">T̸</span>
          </ToolbarButton>
        </div>
      )}
    </div>
  )
}

function ToolbarButton({ active, onClick, label, children }: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`min-w-[1.75rem] h-7 px-1.5 rounded-md text-sm flex items-center justify-center transition-colors ${active ? 'bg-white/25' : 'hover:bg-white/15'}`}
    >
      {children}
    </button>
  )
}

// ── CodeBlockCard ──────────────────────────────────────────────────────────────

function CodeBlockCard({ block, armed, initialEditing, onChange, onDelete, onDragStart, onDragEnd, dragging }: {
  block: CodeBlock
  armed: boolean
  initialEditing: boolean
  onChange: (patch: Partial<Omit<CodeBlock, 'id' | 'type'>>) => void
  onDelete: () => void
  onDragStart: () => void
  onDragEnd: () => void
  dragging: boolean
}) {
  const [editing, setEditing] = useState(initialEditing)
  const cardRef = useRef<HTMLDivElement>(null)
  const taRef   = useRef<HTMLTextAreaElement>(null)
  const pressAt = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (editing) { taRef.current?.focus(); autoResize(taRef.current) }
  }, [editing])

  useEffect(() => { if (editing) autoResize(taRef.current) }, [block.content])

  function handleBlur() {
    setTimeout(() => {
      if (!cardRef.current?.contains(document.activeElement)) setEditing(false)
    }, 0)
  }

  const resolvedLang = LANG_ALIASES[block.lang] ?? block.lang
  const highlighted  = highlight(block.content, resolvedLang)
  const langLabel    = LANGUAGE_OPTIONS.find(o => o.value === resolvedLang)?.label ?? (resolvedLang || 'Plain text')

  return (
    // Darker surround marks the code block as its own clickable, editable region
    <div
      ref={cardRef}
      className={`relative mx-3 my-1.5 p-1 rounded-xl transition-colors ${
        armed
          ? 'bg-red-100 dark:bg-red-950/50 ring-2 ring-red-400'
          : editing
            ? 'bg-indigo-100 dark:bg-indigo-950/60'
            : 'bg-gray-200/80 hover:bg-gray-300/70 dark:bg-black/40 dark:hover:bg-black/60'
      } ${dragging ? 'opacity-40' : ''}`}
    >
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700/50">
      <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800/80 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700/50">
        {/* Only the grip drags, so the code itself can be highlighted and copied */}
        <div
          draggable
          onDragStart={e => {
            e.dataTransfer.effectAllowed = 'move'
            if (cardRef.current) e.dataTransfer.setDragImage(cardRef.current, 16, 16)
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          title="Drag to move"
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="2.5" cy="2.5" r="1.5"/><circle cx="7.5" cy="2.5" r="1.5"/>
            <circle cx="2.5" cy="7"   r="1.5"/><circle cx="7.5" cy="7"   r="1.5"/>
            <circle cx="2.5" cy="11.5" r="1.5"/><circle cx="7.5" cy="11.5" r="1.5"/>
          </svg>
        </div>
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
          <span className="text-xs font-mono text-gray-400 dark:text-gray-500 flex-1 min-w-0 select-none">{langLabel}</span>
        )}
        <button type="button" onClick={onDelete} title="Delete block"
          className="p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {editing ? (
        <textarea
          ref={taRef}
          value={block.content}
          onChange={e => onChange({ content: e.target.value })}
          onBlur={handleBlur}
          onKeyDown={e => {
            if (e.key === 'Tab') {
              e.preventDefault()
              const el = e.currentTarget
              const s = el.selectionStart, end = el.selectionEnd
              onChange({ content: block.content.slice(0, s) + '  ' + block.content.slice(end) })
              setTimeout(() => el.setSelectionRange(s + 2, s + 2), 0)
            }
          }}
          className="w-full font-mono text-[0.8rem] leading-relaxed p-3 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-300 outline-none border-none"
          style={{ overflow: 'hidden', resize: 'none', minHeight: '3.5rem' }}
          spellCheck={false}
          placeholder="Type code here…"
        />
      ) : (
        // Highlighting selects the whole block (to copy it); a plain click opens it for editing, where
        // part of the code can be selected
        <pre
          className="overflow-x-auto overflow-y-auto max-h-72 bg-gray-50 dark:bg-gray-900 p-3 m-0 text-[0.8rem] leading-relaxed text-gray-800 dark:text-gray-300 cursor-pointer select-all"
          onPointerDown={e => { pressAt.current = { x: e.clientX, y: e.clientY } }}
          onClick={e => {
            const p = pressAt.current
            pressAt.current = null
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) return
            setEditing(true)
          }}
          title="Click to edit · drag across to select all"
        >
          <code
            className={resolvedLang ? `language-${resolvedLang}` : undefined}
            dangerouslySetInnerHTML={{ __html: highlighted || '<span class="text-gray-300 dark:text-gray-600 italic select-none">empty — click to edit</span>' }}
          />
        </pre>
      )}
    </div>
    {armed && (
      <p className="text-xs text-center text-red-500 dark:text-red-400 pt-1 select-none">Press Backspace again to delete this code block</p>
    )}
    </div>
  )
}

// ── BlockEditor ────────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (val: string) => void
  rows?: number
  placeholder?: string
  className?: string
  hideHint?: boolean
  // One-line rich input (multiple-choice options): no code blocks, headings or line breaks
  singleLine?: boolean
}

export function BlockEditor({ value, onChange, rows = 3, placeholder, className, hideHint, singleLine }: Props) {
  const [blocks,   setBlocks]   = useState(() => parseBlocks(value))
  const [focusReq, setFocusReq] = useState<{ id: string; at: 'start' | 'end' } | null>(null)
  // Code block highlighted by a first Backspace from the line below it; a second Backspace deletes it
  const [armedCodeId, setArmedCodeId] = useState<string | null>(null)
  const lastSerial = useRef(value)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)

  useEffect(() => {
    if (value !== lastSerial.current) {
      setBlocks(parseBlocks(value))
      lastSerial.current = value
    }
  }, [value])

  function commit(next: Block[]) {
    const normalized = withTextAfterCode(next)
    const serial = serializeBlocks(normalized)
    lastSerial.current = serial
    setBlocks(normalized)
    onChange(serial)
  }

  function updateBlock(id: string, patch: object) {
    setArmedCodeId(null)
    commit(blocks.map(b => b.id === id ? { ...b, ...patch } : b))
  }

  function deleteBlock(id: string) {
    const filtered = blocks.filter(b => b.id !== id)
    const merged   = mergeTextBlocks(filtered)
    if (merged.length === 0) merged.push({ id: uid(), type: 'text', content: '' })
    commit(merged)
  }

  function handleBackspaceAtStart(idx: number): boolean {
    const code = blocks[idx - 1]
    if (code?.type !== 'code') return false
    if (armedCodeId !== code.id) { setArmedCodeId(code.id); return true }
    // Deleting merges this text into the text block above the code (which keeps its id)
    const above = blocks[idx - 2]
    const current = blocks[idx] as TextBlock
    setArmedCodeId(null)
    deleteBlock(code.id)
    if (above?.type === 'text') setFocusReq({ id: above.id, at: 'end' })
    else setFocusReq({ id: current.id, at: 'start' })
    return true
  }

  function focusLastText() {
    const last = [...blocks].reverse().find(b => b.type === 'text')
    if (last) setFocusReq({ id: last.id, at: 'end' })
  }

  function insertBlock(afterId: string, before: string, after: string) {
    const idx = blocks.findIndex(b => b.id === afterId)
    if (idx < 0) return
    const newId    = uid()
    const afterId2 = uid()
    const next = [
      ...blocks.slice(0, idx),
      { ...blocks[idx] as TextBlock, content: before, trail: before !== '' },
      { id: newId, type: 'code' as const, lang: '', content: '' },
      { id: afterId2, type: 'text' as const, content: after, lead: after !== '' },
      ...blocks.slice(idx + 1),
    ]
    // The new code card focuses its own textarea
    commit(next)
  }

  function handleDrop(targetDropIdx: number) {
    if (dragIdx === null) return
    const from = dragIdx
    setDragIdx(null); setDropIdx(null)
    if (from === targetDropIdx || from + 1 === targetDropIdx) return
    const next = [...blocks]
    const [moved] = next.splice(from, 1)
    const insertAt = targetDropIdx > from ? targetDropIdx - 1 : targetDropIdx
    next.splice(insertAt, 0, moved)
    commit(mergeTextBlocks(next))
  }

  const isDragging = dragIdx !== null

  if (singleLine) {
    return (
      <div className={`w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 px-4 py-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent ${className ?? ''}`}>
        <RichTextBlock
          content={value}
          placeholder={placeholder}
          minRows={1}
          isFirst
          singleLine
          focusAt={null}
          onFocused={() => {}}
          onChange={serial => { lastSerial.current = serial; onChange(serial) }}
          onInsertBlock={() => {}}
        />
      </div>
    )
  }

  return (
    <div
      className={`w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent ${className ?? ''}`}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIdx(null) }}
    >
      {blocks.map((block, idx) => (
        <div key={block.id}>
          <div
            className={`mx-3 transition-all duration-150 ${isDragging ? 'h-1.5' : 'h-0'} ${dropIdx === idx && isDragging ? 'bg-indigo-400 rounded' : ''}`}
            onDragOver={e => { e.preventDefault(); setDropIdx(idx) }}
            onDrop={e => { e.preventDefault(); handleDrop(idx) }}
          />

          {block.type === 'text' ? (
            <RichTextBlock
              content={block.content}
              placeholder={placeholder}
              minRows={blocks.length === 1 ? rows : 1}
              isFirst={idx === 0}
              focusAt={focusReq?.id === block.id ? focusReq.at : null}
              onFocused={() => setFocusReq(null)}
              onChange={content => updateBlock(block.id, { content })}
              onInsertBlock={(before, after) => insertBlock(block.id, before, after)}
              onBackspaceAtStart={() => handleBackspaceAtStart(idx)}
              onOtherKey={() => setArmedCodeId(null)}
            />
          ) : (
            <CodeBlockCard
              block={block}
              armed={armedCodeId === block.id}
              initialEditing={block.content === ''}
              onChange={patch => updateBlock(block.id, patch)}
              onDelete={() => deleteBlock(block.id)}
              dragging={dragIdx === idx}
              onDragStart={() => setDragIdx(idx)}
              onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
            />
          )}
        </div>
      ))}

      <div
        className={`mx-3 transition-all duration-150 ${isDragging ? 'h-1.5' : 'h-0'} ${dropIdx === blocks.length && isDragging ? 'bg-indigo-400 rounded' : ''}`}
        onDragOver={e => { e.preventDefault(); setDropIdx(blocks.length) }}
        onDrop={e => { e.preventDefault(); handleDrop(blocks.length) }}
      />

      {!hideHint && (
        <p
          className="px-4 pb-3 text-xs text-gray-300 dark:text-gray-600 select-none cursor-text"
          onMouseDown={e => { e.preventDefault(); focusLastText() }}
        >
          Type <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">/</span> anywhere to insert a block or formatting
        </p>
      )}
    </div>
  )
}
