'use client'

import { useEffect, useRef, useState } from 'react'
import { InputRule, Mark, Node, mergeAttributes, type Extensions } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Document from '@tiptap/extension-document'
import { Placeholder } from '@tiptap/extensions'
import { COLOR_CLASSES, renderMath } from '@/components/ContentRenderer'
import { MathPopup } from './MathPopup'

// ── Color mark: [red]text[/red] ───────────────────────────────────────────────

export const ColorMark = Mark.create({
  name: 'color',
  addAttributes() {
    return { color: { default: 'red', parseHTML: el => el.getAttribute('data-color') } }
  },
  parseHTML() { return [{ tag: 'span[data-color]' }] },
  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes.color as string
    return ['span', { 'data-color': color, class: COLOR_CLASSES[color] ?? '' }, 0]
  },
})

// ── Math node view (shared by inline and block math) ─────────────────────────

function MathView({ node, updateAttributes, deleteNode, editor, getPos, selected }: ReactNodeViewProps) {
  const latex   = String(node.attrs.latex ?? '')
  const display = node.type.name === 'mathBlock' || !!node.attrs.display
  const ref     = useRef<HTMLSpanElement>(null)
  // A freshly inserted empty node opens its editor straight away
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!latex && ref.current) setAnchor(ref.current.getBoundingClientRect())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function placeCursorAfter() {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (pos !== undefined) editor.chain().focus().setTextSelection(pos + node.nodeSize).run()
  }

  function commit(value: string) {
    setAnchor(null)
    if (!value.trim()) { deleteNode(); editor.commands.focus(); return }
    if (value !== latex) updateAttributes({ latex: value })
    placeCursorAfter()
  }

  function cancel() {
    setAnchor(null)
    if (!latex) { deleteNode(); editor.commands.focus(); return }
    placeCursorAfter()
  }

  const Tag = node.type.name === 'mathBlock' ? 'div' : 'span'
  return (
    <NodeViewWrapper as={Tag} className={node.type.name === 'mathBlock' ? 'flex justify-center py-2' : 'inline'}>
      <span
        ref={ref}
        onMouseDown={e => e.preventDefault()}
        onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget.getBoundingClientRect()) }}
        className={`cursor-pointer rounded px-0.5 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/30 ${
          selected || anchor ? 'ring-2 ring-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : ''
        } ${display ? 'inline-block overflow-x-auto max-w-full' : 'inline-block align-middle'}`}
        title="Click to edit math"
      >
        {latex
          ? <span dangerouslySetInnerHTML={{ __html: renderMath(latex, display) }} />
          : <span className="text-sm font-mono text-gray-400 dark:text-gray-500 px-1">∑ math</span>}
      </span>
      {anchor && (
        <MathPopup initial={latex} display={display} anchor={anchor} onCommit={commit} onCancel={cancel} />
      )}
    </NodeViewWrapper>
  )
}

const mathAttrs = {
  latex:   { default: '' },
  display: { default: false },
}

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() { return mathAttrs },
  parseHTML() { return [{ tag: 'span[data-math-inline]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-math-inline': '' })] },
  addNodeView() { return ReactNodeViewRenderer(MathView) },
  addInputRules() {
    const type = this.type
    const toMath = (display: boolean) => ({ state, range, match }: { state: import('@tiptap/pm/state').EditorState; range: { from: number; to: number }; match: RegExpMatchArray }) => {
      state.tr.replaceWith(range.from, range.to, type.create({ latex: match[1], display }))
    }
    return [
      // $$expr$$ → display math
      new InputRule({ find: /\$\$([^$\n]+)\$\$$/, handler: toMath(true) }),
      // $expr$ → inline math. Expression can't start/end with a space (so "$5 and $" stays text),
      // and the opening $ can't be escaped or part of $$.
      new InputRule({ find: /(?<![\\$])\$([^$\s](?:[^$\n]*[^$\s])?)\$$/, handler: toMath(false) }),
    ]
  },
})

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() { return { latex: { default: '' } } },
  parseHTML() { return [{ tag: 'div[data-math-block]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': '' })] },
  addNodeView() { return ReactNodeViewRenderer(MathView) },
})

// ── Extension sets ────────────────────────────────────────────────────────────

export function buildExtensions({ singleLine, placeholder }: { singleLine?: boolean; placeholder?: string }): Extensions {
  return [
    StarterKit.configure({
      // Only what the card markup format can store
      document:       singleLine ? false : undefined,
      heading:        singleLine ? false : { levels: [1, 2, 3] },
      codeBlock:      false,
      blockquote:     false,
      bulletList:     false,
      orderedList:    false,
      listItem:       false,
      listKeymap:     false,
      horizontalRule: false,
      strike:         false,
      underline:      false,
      link:           false,
      hardBreak:      false,
      trailingNode:   false,
      dropcursor:     false,
      gapcursor:      false,
    }),
    ...(singleLine ? [Document.extend({ content: 'paragraph' })] : [MathBlock]),
    ColorMark,
    MathInline,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ]
}
