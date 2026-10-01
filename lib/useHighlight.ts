'use client'

import { useEffect, type RefObject } from 'react'

// Highlights every match of `query` inside `container` with the CSS Custom Highlight API (styled by
// ::highlight(card-search) in globals.css). It marks text where it's rendered, formatting and math
// included, without changing the page. Browsers without the API just don't highlight.
const NAME = 'card-search'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function useHighlight(container: RefObject<HTMLElement | null>, query: string, deps: unknown[]) {
  useEffect(() => {
    const highlights = typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: Map<string, unknown> }).highlights : undefined
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    if (!highlights || !HighlightCtor) return
    const needle = fold(query.trim())
    const root = container.current
    if (!root || !needle) { highlights.delete(NAME); return }

    const ranges: Range[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ?? ''
      // Accents are dropped one character at a time, so positions in the folded text match the original
      const folded = [...text].map(fold).join('')
      if (folded.length !== text.length) {
        // Rare (a character that folds to more or fewer letters): fall back to plain lowercase
        let i = text.toLowerCase().indexOf(needle)
        while (i >= 0) { const r = new Range(); r.setStart(node, i); r.setEnd(node, i + needle.length); ranges.push(r); i = text.toLowerCase().indexOf(needle, i + needle.length) }
        continue
      }
      let i = folded.indexOf(needle)
      while (i >= 0) {
        const r = new Range()
        r.setStart(node, i)
        r.setEnd(node, i + needle.length)
        ranges.push(r)
        i = folded.indexOf(needle, i + needle.length)
      }
    }
    highlights.set(NAME, new HighlightCtor(...ranges))
    return () => { highlights.delete(NAME) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ...deps])
}
