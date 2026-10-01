'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRouteIds } from '@/lib/useRouteIds'
import Link from 'next/link'
import { store, PartialInsertError } from '@/lib/store'
import { TYPE_BADGES } from '@/lib/cardTypes'
import { parseCards } from '@/lib/cardFormat'
import { paths } from '@/lib/paths'


const AI_PROMPT = `You are creating flashcards for a study set on: [REPLACE WITH YOUR TOPIC]

Instructions:
- Generate as many cards as needed to build a comprehensive understanding of the topic — do not limit yourself to a fixed count
- Base all content on accurate, real-world information from credible sources (textbooks, peer-reviewed research, official documentation, encyclopedias, authoritative references)
- Include a mix of card types: open-ended recall, type-the-answer, fill-in-the-blank (use ___ in the question), multiple choice, true/false, and matching
- For programming or technical topics, include code examples where helpful

Output ONLY the raw card data — one card per line, tab-separated. No headers, numbering, labels, or extra text of any kind.

Formats (use a real tab character between each column):
- Open-ended:      Question [TAB] Answer
- Type the answer: [type] Question [TAB] Short exact answer [TAB] Other accepted answer (optional, more allowed)
- Fill-in-blank:   Sentence with ___ in it [TAB] Missing word or phrase
- Multiple choice: Question [TAB] Correct answer [TAB] Wrong option [TAB] Wrong option [TAB] Wrong option
- True/false:      Statement [TAB] True   (or False)
- Matching:        [match] Instructions [TAB] Term = Match [TAB] Term = Match [TAB] …   (2–8 pairs, each "left = right")

Use type-the-answer only for short answers (a word, name, number, or term) that someone could type exactly; the check ignores capitalization, accents, and small typos. Use matching for sets of 3–6 related term/definition pairs.

Code blocks: since each card must be one line, use \\n for line breaks inside code fields.
Code that goes with a question belongs in the question column, after the question text and a \\n. Never give code its own column: the column after the question is always the answer.
Always specify a language name after the opening backticks — it enables syntax highlighting. Supported names: python, javascript, typescript, jsx, tsx, java, c, cpp, csharp, go, rust, kotlin, swift, ruby, php, bash, sql, json, yaml, html. Example:
What does this function return?\\n\`\`\`python\\ndef double(x):\\n    return x * 2\\n\`\`\`[TAB]The number multiplied by 2

For short inline code, use single backticks: What does \`n & (n-1)\` do?[TAB]Clears the lowest set bit of n

Rich formatting — use naturally where it genuinely aids recall. Do not overuse; plain text is fine for simple facts.
- Bold key terms: **mitochondria**  Italic for emphasis: *in vivo*
- Colors to highlight: [red]danger[/red]  [green]correct[/green]  [blue]key concept[/blue]  [yellow]caution[/yellow]  [orange]warning[/orange]  [purple]definition[/purple]
- Inline code for short identifiers or expressions: \`nums[i]\`
- Headings only when the answer is structured (start of field): # H1  ## H2  ### H3
- Lists: one item per line, starting with "- " (bullets) or "1. " (numbered). Because each card is one line, separate the items with \\n, e.g.  Steps:\\n1. Sort\\n2. Scan
- Inline math: $E = mc^2$
- Centered math block (its own line): $$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$ — put it alone on a line (use \\n before/after it if there is other text)
- A literal dollar sign or asterisk that is NOT formatting must be escaped: \\$5, 2 \\* 3

Example output (these use real tab characters — replace [TAB] with an actual tab):
What is the powerhouse of the cell?	**Mitochondria** — produces ATP via cellular respiration
The ___ is the basic unit of heredity.	gene
What type of bond holds the two DNA strands together?	Hydrogen bonds	Covalent bonds	Ionic bonds	Peptide bonds
What does \`arr.sort()\` return in Python?	[red]None[/red] — it sorts *in-place* and returns nothing
What does this function do?\\n\`\`\`python\\ndef fib(n):\\n    if n <= 1: return n\\n    return fib(n-1) + fib(n-2)\\n\`\`\`	Computes the nth Fibonacci number recursively
What is the quadratic formula?	$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$
What is Newton's second law?	$F = ma$ — [blue]force[/blue] equals **mass** times **acceleration**
What is the time complexity of binary search?	$O(\\log n)$ — the search space **halves** each step
What are the steps of binary search?	1. Set \`lo\` and \`hi\` to the ends\\n2. Check the middle element\\n3. Discard the half that can't contain the target
Solve $ax^2 + bx + c = 0$.	Use the quadratic formula:\\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$
___ is the process by which plants convert sunlight into glucose.	Photosynthesis
Which sorting algorithm has worst-case $O(n^2)$ time complexity?	Bubble sort	Merge sort	Quick sort	Heap sort
[type] Which organelle contains the cell's DNA?	nucleus
[type] What is the chemical symbol for sodium?	Na
Mitochondria have their own DNA.	True
[match] Match each organelle to its function	Ribosome = Makes proteins	Nucleus = Stores DNA	Mitochondria = Produces ATP	Golgi apparatus = Packages proteins`

export default function ImportCards() {
  const { id: setId } = useRouteIds()
  const router = useRouter()

  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [showAI, setShowAI] = useState(false)
  const [copied, setCopied] = useState(false)

  const preview = parseCards(text)

  async function copyPrompt() {
    await navigator.clipboard.writeText(AI_PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleImport() {
    if (preview.length === 0) return setError('No valid cards detected. Check the format.')
    setError('')
    setImporting(true)

    const count = await store.countCards(setId).catch(() => 0)
    const room = store.maxCardsPerSet - count
    if (preview.length > room) {
      setError(
        room <= 0
          ? `This set already has the maximum of ${store.maxCardsPerSet.toLocaleString()} cards.`
          : `Sets can hold up to ${store.maxCardsPerSet.toLocaleString()} cards. This set has room for ${room.toLocaleString()} more, but you're importing ${preview.length.toLocaleString()}.`
      )
      setImporting(false)
      return
    }

    try {
      await store.addCards(setId, preview.map(c => ({ type: c.type, question: c.question, answer: c.answer, options: c.options, pairs: c.pairs })))
    } catch (err) {
      setError(err instanceof PartialInsertError
        ? `Import stopped partway — ${err.added} of ${preview.length} cards were added. Please try the rest again.`
        : 'Import failed. Please try again.')
      setImporting(false)
      return
    }

    router.push(paths.set(setId))
  }

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href={paths.set(setId)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import Cards</h1>
      </div>

      {/* Generate with AI */}
      <div className="mb-4 rounded-xl border border-violet-200 dark:border-violet-800 overflow-hidden">
        <button
          onClick={() => setShowAI(!showAI)}
          className="w-full flex items-center justify-between px-4 py-3 bg-violet-50 dark:bg-violet-950/40 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">✨</span>
            <span className="text-sm font-semibold text-violet-800 dark:text-violet-300">Generate cards with AI</span>
          </div>
          <span className="text-xs text-violet-500 dark:text-violet-400">{showAI ? '▲' : '▼'}</span>
        </button>

        {showAI && (
          <div className="px-4 pb-4 bg-violet-50 dark:bg-violet-950/40 border-t border-violet-100 dark:border-violet-800/50">
            <p className="text-xs text-violet-700 dark:text-violet-400 mt-3 mb-3 leading-relaxed">
              Use any AI assistant (Claude, ChatGPT, Gemini, etc.) to generate a full study set on any topic.
            </p>
            <ol className="text-xs text-violet-700 dark:text-violet-400 space-y-1 mb-3 list-none">
              <li>1. Copy the prompt below</li>
              <li>2. Paste it into your AI, replacing <span className="font-mono bg-violet-100 dark:bg-violet-900/60 px-1 rounded">[REPLACE WITH YOUR TOPIC]</span> with your subject</li>
              <li>3. Copy the AI&apos;s response and paste it into the text area below</li>
            </ol>
            <div className="relative">
              <pre className="bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-700 rounded-lg px-3 py-3 text-xs text-gray-700 dark:text-gray-300 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {AI_PROMPT}
              </pre>
              <button
                onClick={copyPrompt}
                className="absolute top-2 right-2 px-2.5 py-1 text-xs font-semibold rounded-md bg-violet-600 text-white hover:bg-violet-700 active:bg-violet-800 transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4 mb-5 flex items-center justify-between">
        <p className="text-sm text-indigo-700 dark:text-indigo-300">Need help with the format?</p>
        <Link
          href="/import-format"
          className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          View instructions →
        </Link>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Paste your cards here
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={`What is the capital of France?\nParis\n\nWhat is 2 + 2?\n4`}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm resize-none"
        />
      </div>

      {/* Preview */}
      {text.trim() && (
        <div className="mb-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Preview — {preview.length} card{preview.length !== 1 ? 's' : ''} detected
          </p>
          {preview.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {preview.slice(0, 10).map((card, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-lg px-3 py-2.5 border border-gray-100 dark:border-gray-700 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      {TYPE_BADGES[card.type]}
                    </span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium line-clamp-1">{card.question}</span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 line-clamp-1 text-xs pl-7">
                    {card.type === 'matching' ? card.pairs?.map(p => `${p.left} ↔ ${p.right}`).join(' · ')
                      : card.type === 'typed' && card.options ? `${card.answer} (also: ${card.options.join(', ')})`
                      : card.answer}
                  </p>
                </div>
              ))}
              {preview.length > 10 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-1">
                  +{preview.length - 10} more cards
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
              No cards detected. Check the format.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-red-500 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-4">
          {error}
        </p>
      )}

      <button
        onClick={handleImport}
        disabled={importing || preview.length === 0}
        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {importing ? 'Importing...' : `Import ${preview.length > 0 ? preview.length : ''} Card${preview.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}
