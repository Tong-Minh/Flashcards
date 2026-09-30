'use client'

import { useEffect, useRef, useState } from 'react'
import { Extension, InputRule, Mark, Node, mergeAttributes, type Extensions } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { Plugin, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Document from '@tiptap/extension-document'
import { BulletList, OrderedList, ListItem, ListKeymap } from '@tiptap/extension-list'
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
  // Where the pointer went down, so a drag (selecting) isn't mistaken for a click (editing)
  const pressAt = useRef<{ x: number; y: number } | null>(null)
  // A freshly inserted empty node opens its editor straight away
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (latex) return
    // A new node view isn't attached and laid out on mount, so measuring now gives an empty rect at
    // the top-left of the screen. Wait until it has a real position (a few frames at most).
    let frame = 0
    let tries = 0
    const measure = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (rect && (rect.width > 0 || rect.height > 0)) { setAnchor(rect); return }
      if (++tries < 10) frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function placeCursorAfter() {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (pos === undefined) return
    const after = pos + node.nodeSize
    if (!node.isBlock) { editor.chain().focus().setTextSelection(after).run(); return }
    // A block has no text position right after it: move into the next paragraph, creating one if needed
    const next = editor.state.doc.resolve(after).nodeAfter
    if (next?.isTextblock) editor.chain().focus().setTextSelection(after + 1).run()
    else editor.chain().focus().insertContentAt(after, { type: 'paragraph' }).setTextSelection(after + 1).run()
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
    // Display math is centered on its own line, matching how it renders when studying
    <NodeViewWrapper as={Tag} className={node.type.name === 'mathBlock' ? 'flex justify-center py-2' : display ? 'block text-center py-1' : 'inline'}>
      <span
        ref={ref}
        // Dragging across the equation selects it (to copy the whole thing); a plain click opens the
        // LaTeX editor, where part of it can be selected
        onMouseDown={e => { pressAt.current = { x: e.clientX, y: e.clientY } }}
        onClick={e => {
          e.stopPropagation()
          const p = pressAt.current
          pressAt.current = null
          if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) return
          setAnchor(e.currentTarget.getBoundingClientRect())
        }}
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

// Explicit data- attributes so copied math pastes back exactly (the default attribute round-trip
// turns display=false into the string "false", which reads back as true)
const latexAttr = {
  default: '',
  parseHTML: (el: HTMLElement) => el.getAttribute('data-latex') ?? '',
  renderHTML: (attrs: Record<string, unknown>) => ({ 'data-latex': String(attrs.latex ?? '') }),
}
const mathAttrs = {
  latex: latexAttr,
  display: {
    default: false,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-display') === 'true',
    renderHTML: (attrs: Record<string, unknown>) => ({ 'data-display': attrs.display ? 'true' : 'false' }),
  },
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
  // Copied as plain text, math keeps its LaTeX source
  renderText({ node }) { return node.attrs.display ? `$$${node.attrs.latex}$$` : `$${node.attrs.latex}$` },
  addNodeView() { return ReactNodeViewRenderer(MathView) },
  addInputRules() {
    const type = this.type
    type RuleProps = { state: EditorState; range: { from: number; to: number }; match: RegExpMatchArray }
    const toMath = (display: boolean) => ({ state, range, match }: RuleProps) => {
      state.tr.replaceWith(range.from, range.to, type.create({ latex: match[1], display }))
    }
    // $$expr$$ typed as the whole line becomes a centered math block; mid-sentence it stays inline
    const toDisplay = ({ state, range, match }: RuleProps) => {
      const { tr, schema } = state
      const $from = tr.doc.resolve(range.from)
      const blockType = schema.nodes.mathBlock
      const wholeLine = blockType && $from.parent.type.name === 'paragraph'
        && range.from === $from.start() && range.to === $from.end()
      if (!wholeLine) { toMath(true)({ state, range, match }); return }
      const start = $from.before()
      const block = blockType.create({ latex: match[1] })
      tr.replaceWith(start, $from.after(), block)
      const after = start + block.nodeSize
      if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, schema.nodes.paragraph.create())
      tr.setSelection(TextSelection.create(tr.doc, after + 1))
    }
    return [
      new InputRule({ find: /\$\$([^$\n]+)\$\$$/, handler: toDisplay }),
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
  addAttributes() { return { latex: latexAttr } },
  parseHTML() { return [{ tag: 'div[data-math-block]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': '' })] },
  renderText({ node }) { return `$$${node.attrs.latex}$$` },
  addNodeView() { return ReactNodeViewRenderer(MathView) },
})

// ── Extension sets ────────────────────────────────────────────────────────────

// The browser doesn't paint the selection highlight over rendered math (it isn't editable text), so
// equations fully inside a text selection get a class that highlights them as one whole block.
const MathInSelection = Extension.create({
  name: 'mathInSelection',
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations(state) {
          const { from, to, empty } = state.selection
          if (empty) return null
          const decorations: Decoration[] = []
          state.doc.nodesBetween(from, to, (node, pos) => {
            if ((node.type.name === 'mathInline' || node.type.name === 'mathBlock') && pos >= from && pos + node.nodeSize <= to) {
              decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'math-in-selection' }))
            }
          })
          return DecorationSet.create(state.doc, decorations)
        },
      },
    })]
  },
})

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
      // gapcursor stays on so arrow keys can place the cursor next to a math block
    }),
    ...(singleLine
      ? [Document.extend({ content: 'paragraph' })]
      : [
          MathBlock,
          // One level of "- " / "1. " lists; typing "- " or "1. " at a line start converts it
          BulletList,
          OrderedList,
          ListItem.extend({ content: 'paragraph' }),
          ListKeymap,
        ]),
    ColorMark,
    MathInline,
    MathInSelection,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ]
}
