// LaTeX that MathJax (Anki) accepts but KaTeX doesn't, rewritten into what KaTeX supports. Applied
// when rendering, so cards imported earlier render correctly too.

// \unicode{…} code points that KaTeX has commands for (the closed surface/volume integrals)
const UNICODE_COMMANDS: Record<number, string> = { 0x222e: '\\oint ', 0x222f: '\\oiint ', 0x2230: '\\oiiint ' }

// Commands that take one braced argument, which MathJax lets follow _ or ^ without braces (x_\vec{a})
const ONE_ARG = 'vec|hat|widehat|bar|overline|underline|tilde|widetilde|dot|ddot|text|textbf|textit|mathbf|mathrm|mathit|mathcal|mathbb|boldsymbol|operatorname|sqrt'

// The index just past the group that opens at s[i] ('{'), or -1 if it never closes
function groupEnd(s: string, i: number): number {
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue }
    if (s[j] === '{') depth++
    else if (s[j] === '}' && --depth === 0) return j + 1
  }
  return -1
}

const SCRIPT_COMMAND = new RegExp(`[_^]\\s*\\\\(${ONE_ARG}|textcolor|color|frac|dfrac|tfrac)(?![a-zA-Z])`, 'g')
const TWO_ARGS = new Set(['textcolor', 'frac', 'dfrac', 'tfrac'])

function braceScriptArguments(s: string): string {
  let out = '', last = 0
  for (const m of s.matchAll(SCRIPT_COMMAND)) {
    if (m.index < last) continue
    let end = m.index + m[0].length
    for (let k = 0; k < (TWO_ARGS.has(m[1]) ? 2 : 1) && end > 0; k++) {
      while (s[end] === ' ') end++
      end = s[end] === '{' ? groupEnd(s, end) : -1
    }
    if (end < 0) continue
    out += s.slice(last, m.index) + s[m.index] + '{' + s.slice(m.index + 1, end).trimStart() + '}'
    last = end
  }
  return out + s.slice(last)
}

export function normalizeLatex(expr: string, display: boolean): string {
  // \unicode{x222f} / \unicode{8751}: KaTeX has no \unicode, but has \char
  let out = expr.replace(/\\unicode\s*\{\s*(x[0-9a-f]+|\d+)\s*\}/gi, (_, code: string) => {
    const n = /^x/i.test(code) ? parseInt(code.slice(1), 16) : parseInt(code, 10)
    return UNICODE_COMMANDS[n] ?? `{\\char"${n.toString(16).toUpperCase()}}`
  })
  // align, eqnarray and gather only work in display math; inline, their "-ed" forms render the same
  if (!display) {
    out = out.replace(/\\(begin|end)\s*\{\s*(align|eqnarray|gather)\*?\s*\}/g,
      (_, edge: string, env: string) => `\\${edge}{${env === 'gather' ? 'gathered' : 'aligned'}}`)
  }
  // An empty color ("\textcolor{}{x}"): MathJax ignores it, KaTeX errors
  out = out.replace(/\\(text)?color\s*\{\s*\}/g, '')
  // A_\vec{a}, x^\textcolor{red}{i}: brace the command and its argument(s)
  out = braceScriptArguments(out)
  // \text{__}: underscores are literal in MathJax's text mode, an error in KaTeX's
  out = out.replace(/\\text\s*\{([^{}]*)\}/g, (_, t: string) => `\\text{${t.replace(/(?<!\\)_/g, '\\_')}}`)
  // Plain-TeX \array{a & b \\ c & d} (MathJax) → a matrix environment
  for (let i = out.indexOf('\\array'); i >= 0; i = out.indexOf('\\array', i + 1)) {
    let open = i + 6
    while (out[open] === ' ') open++
    if (/[a-zA-Z]/.test(out[i + 6] ?? '') || out[open] !== '{') continue
    const end = groupEnd(out, open)
    if (end < 0) break
    out = out.slice(0, i) + `\\begin{matrix}${out.slice(open + 1, end - 1)}\\end{matrix}` + out.slice(end)
  }
  return out
}
