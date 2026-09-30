'use client'

import { useEffect } from 'react'

// Rendered math is KaTeX HTML, which copies as a jumble of symbols. When a copied selection includes
// any equation (elements with data-latex, from ContentRenderer), put the markup source on the clipboard
// instead: each equation becomes $…$ (or $$…$$ for display math), the rest stays as displayed text.
// The editor handles its own copying (ProseMirror prevents the default first), so it's skipped here.
export function CopyAsSource() {
  useEffect(() => {
    function onCopy(e: ClipboardEvent) {
      if (e.defaultPrevented || !e.clipboardData) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return

      const holder = document.createElement('div')
      for (let i = 0; i < sel.rangeCount; i++) holder.appendChild(sel.getRangeAt(i).cloneContents())
      const maths = holder.querySelectorAll<HTMLElement>('[data-latex]')
      // A selection that starts or ends inside an equation clones only part of it; the attribute is
      // still there, so fall back to the equation the selection touches.
      const partial = maths.length === 0 ? closestMath(sel.anchorNode) ?? closestMath(sel.focusNode) : null
      if (maths.length === 0 && !partial) return

      if (partial) {
        const latex = partial.dataset.latex ?? ''
        e.clipboardData.setData('text/plain', partial.hasAttribute('data-display') ? `$$${latex}$$` : `$${latex}$`)
        e.preventDefault()
        return
      }

      maths.forEach(el => {
        const latex = el.dataset.latex ?? ''
        el.replaceWith(document.createTextNode(el.hasAttribute('data-display') ? `$$${latex}$$` : `$${latex}$`))
      })
      // innerText keeps line breaks between blocks, so it has to be measured while attached
      holder.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap'
      document.body.appendChild(holder)
      const text = holder.innerText
      holder.remove()
      e.clipboardData.setData('text/plain', text)
      e.preventDefault()
    }

    document.addEventListener('copy', onCopy)
    return () => document.removeEventListener('copy', onCopy)
  }, [])

  return null
}

function closestMath(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement
  return el?.closest<HTMLElement>('[data-latex]') ?? null
}
