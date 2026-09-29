import Link from 'next/link'

export default function ImportFormat() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
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

        {/* Tips */}
        <section className="bg-indigo-50 rounded-2xl border border-indigo-100 p-5">
          <h2 className="font-semibold text-indigo-900 text-base mb-2">Tips</h2>
          <ul className="space-y-1.5 text-indigo-800 text-sm">
            <li>• You can mix open-ended and multiple-choice in the same import (as long as you use tab format for MC)</li>
            <li>• Blank-line format works great for pasting from notes apps</li>
            <li>• Tab format works great for pasting from Google Sheets or Excel</li>
            <li>• The app shows a live preview before you import — check it looks right first</li>
          </ul>
        </section>

      </div>
    </div>
  )
}
