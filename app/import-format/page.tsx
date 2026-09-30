import Link from 'next/link'

export default function ImportFormat() {
  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6 lg:py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-xl transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Import Format</h1>
      </div>

      <div className="space-y-6 text-sm text-gray-700">

        {/* Format 1 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 text-base mb-1">Format 1 — Blank line separated</h2>
          <p className="text-gray-500 mb-3">Write each question on one line, the answer on the next line, then leave a blank line before the next card.</p>
          <pre className="bg-gray-50 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto border border-gray-100">{`What is the capital of France?
Paris

What is the powerhouse of the cell?
Mitochondria

Who wrote Hamlet?
William Shakespeare`}</pre>
        </section>

        {/* Format 2 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 text-base mb-1">Format 2 — Tab separated (one card per line)</h2>
          <p className="text-gray-500 mb-3">
            Put the question and answer on the same line, separated by a <strong>tab character</strong>. Each line becomes one card.
          </p>
          <pre className="bg-gray-50 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto border border-gray-100">{`What is the capital of France?	Paris
What is the powerhouse of the cell?	Mitochondria
Who wrote Hamlet?	William Shakespeare`}</pre>
          <p className="text-xs text-gray-400 mt-2">Tip: copy from a spreadsheet — columns paste as tab-separated.</p>
        </section>

        {/* Format 3 — MC */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 text-base mb-1">Format 3 — Multiple choice (tab separated)</h2>
          <p className="text-gray-500 mb-3">
            For multiple choice cards, add the three wrong options after the correct answer — all separated by tabs. The app will shuffle the options automatically.
          </p>
          <pre className="bg-gray-50 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto border border-gray-100">{`What is the capital of France?	Paris	Berlin	Madrid	Rome
What is the powerhouse of the cell?	Mitochondria	Nucleus	Ribosome	Golgi`}</pre>
          <div className="mt-3 space-y-1 text-xs text-gray-500">
            <p><span className="font-medium text-gray-700">Column 1:</span> Question</p>
            <p><span className="font-medium text-gray-700">Column 2:</span> Correct answer</p>
            <p><span className="font-medium text-gray-700">Columns 3–5:</span> Three wrong options</p>
          </div>
        </section>

        {/* Format 4 — Fill in blank */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 text-base mb-1">Fill in the Blank — automatic detection</h2>
          <p className="text-gray-500 mb-3">
            Any card (in either format above) whose question contains <code className="bg-gray-100 px-1 rounded text-xs font-mono">___</code> is automatically imported as a fill-in-the-blank card. The answer fills the blank during study.
          </p>
          <pre className="bg-gray-50 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto border border-gray-100">{`The capital of France is ___
Paris

___ is the powerhouse of the cell.
Mitochondria`}</pre>
          <p className="text-xs text-gray-400 mt-2">Tab format works too: <span className="font-mono">The capital of France is ___{"\\t"}Paris</span></p>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 text-base mb-1">True / False — automatic detection</h2>
          <p className="text-gray-500 mb-3">
            A card whose answer is exactly <code className="bg-gray-100 px-1 rounded text-xs font-mono">True</code> or <code className="bg-gray-100 px-1 rounded text-xs font-mono">False</code> becomes a true/false card.
          </p>
          <pre className="bg-gray-50 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto border border-gray-100">{`The Pacific is the largest ocean.	True
Bats are blind.	False`}</pre>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 text-base mb-1">Type the answer (tab separated)</h2>
          <p className="text-gray-500 mb-3">
            Start the question with <code className="bg-gray-100 px-1 rounded text-xs font-mono">[type]</code>. When studying you type the answer; capitalization, accents, extra spaces, a leading &ldquo;a/an/the&rdquo;, and small typos are forgiven. Any extra columns are other answers that also count.
          </p>
          <pre className="bg-gray-50 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto border border-gray-100">{`[type] What is the capital of Japan?	Tokyo
[type] Largest US state by area?	Alaska	AK`}</pre>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 text-base mb-1">Matching (tab separated)</h2>
          <p className="text-gray-500 mb-3">
            Start with <code className="bg-gray-100 px-1 rounded text-xs font-mono">[match]</code> and optional instructions, then one column per pair written as <code className="bg-gray-100 px-1 rounded text-xs font-mono">term = match</code>. Use 2–8 pairs; the matches are shuffled when studying.
          </p>
          <pre className="bg-gray-50 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto border border-gray-100">{`[match] Match each country to its capital	France = Paris	Japan = Tokyo	Peru = Lima`}</pre>
        </section>

        {/* Rich formatting */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 text-base mb-1">Rich formatting</h2>
          <p className="text-gray-500 mb-4">You can use these in any question or answer field — both when importing and when creating cards manually.</p>
          <div className="space-y-4 text-xs">

            <div>
              <p className="font-semibold text-gray-700 mb-1">Bold &amp; italic</p>
              <pre className="bg-gray-50 rounded-xl p-3 leading-relaxed overflow-x-auto border border-gray-100">{`**bold text**
*italic text*`}</pre>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Headings</p>
              <pre className="bg-gray-50 rounded-xl p-3 leading-relaxed overflow-x-auto border border-gray-100">{`# Heading 1
## Heading 2
### Heading 3`}</pre>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Colored text</p>
              <pre className="bg-gray-50 rounded-xl p-3 leading-relaxed overflow-x-auto border border-gray-100">{`[red]important term[/red]
[blue]key concept[/blue]
[green]correct answer[/green]
[yellow]caution[/yellow]
[orange]warning[/orange]
[purple]definition[/purple]`}</pre>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Lists</p>
              <pre className="bg-gray-50 rounded-xl p-3 leading-relaxed overflow-x-auto border border-gray-100">{`- bullet point
- another bullet

1. first step
2. second step`}</pre>
              <p className="text-gray-400 mt-1">One item per line. In the tab format, separate items with <span className="font-mono">\n</span>.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Math (LaTeX / KaTeX)</p>
              <pre className="bg-gray-50 rounded-xl p-3 leading-relaxed overflow-x-auto border border-gray-100">{`Inline: the area is $\\pi r^2$ square units

Centered block (alone on its own line):
$$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$`}</pre>
              <p className="text-gray-400 mt-1">A <span className="font-mono">$$…$$</span> line by itself is shown centered. In the tab format, put <span className="font-mono">\n</span> before and after it.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Literal symbols</p>
              <pre className="bg-gray-50 rounded-xl p-3 leading-relaxed overflow-x-auto border border-gray-100">{`It costs \\$5          → It costs $5
2 \\* 3 = 6           → 2 * 3 = 6`}</pre>
              <p className="text-gray-400 mt-1">Put a backslash before <span className="font-mono">$ * ` [ ] #</span> when you mean the character itself, not formatting.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Inline &amp; block code</p>
              <pre className="bg-gray-50 rounded-xl p-3 leading-relaxed overflow-x-auto border border-gray-100">{`Inline: \`arr.sort()\`

Block:
\`\`\`python
def hello():
    return "world"
\`\`\``}</pre>
            </div>

            <p className="text-gray-400 pt-1">In the tab format, use <span className="font-mono">\\n</span> for any line break (code blocks, lists, math blocks), since each card must be one line.</p>
          </div>
        </section>

        {/* Tips */}
        <section className="bg-indigo-50 rounded-2xl border border-indigo-100 p-5">
          <h2 className="font-semibold text-indigo-900 text-base mb-2">Tips</h2>
          <ul className="space-y-1.5 text-indigo-800 text-sm">
            <li>• You can mix all card types in the same import — fill-in-blank and true/false are detected automatically</li>
            <li>• Blank-line format works great for pasting from notes apps</li>
            <li>• Tab format works great for pasting from Google Sheets or Excel</li>
            <li>• The app shows a live preview before you import — check it looks right first</li>
            <li>• When editing a card, type <span className="font-mono text-xs">/</span> for a menu of all formatting options, or select text to get a formatting toolbar</li>
          </ul>
        </section>

      </div>
    </div>
  )
}
