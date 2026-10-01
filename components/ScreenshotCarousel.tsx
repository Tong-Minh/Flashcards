'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Screenshots in public/screenshots (made from the owner's PNGs: WebP, 1600px wide at most)
const SLIDES = [
  { src: 'library',        title: 'Your library',                 text: 'Collections and sets at a glance, with how many cards are waiting for you today.' },
  { src: 'study-question', title: 'Studies like Anki',            text: 'FSRS spaced repetition decides what comes up and when. Undo, bury and suspend, all from the keyboard.' },
  { src: 'study-answer',   title: 'Rate how well you knew it',    text: 'Again, Hard, Good or Easy, each showing when you’ll see the card next.' },
  { src: 'set',            title: 'Looks like Quizlet',           text: 'Every card in a set with its formatting and pictures, plus search, progress and stats.' },
  { src: 'slash-menu',     title: 'Edits like Notion',            text: 'Type / for code blocks, math, images and more. You never see raw markup.' },
  { src: 'edit-card',      title: 'Seven kinds of card',          text: 'Open-ended, type the answer, multiple choice, true/false, fill in the blank, matching, and image occlusion.' },
  { src: 'import-anki',    title: 'Bring your Anki decks',        text: 'Import an .apkg: subdecks become sets, and math, images and audio come along.' },
  { src: 'collection',     title: 'Stay organized',               text: 'Group sets into collections, tag them, and search everything.' },
  { src: 'library-folder', title: 'Your cards are your files',    text: 'The desktop app keeps everything in a folder on your computer. No account, works offline.' },
]

// A swipeable gallery (scroll snap) with arrows and dots
export function ScreenshotCarousel() {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  const go = (i: number) => {
    const el = track.current
    if (!el) return
    const next = (i + SLIDES.length) % SLIDES.length
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  const arrow = 'absolute top-1/2 -translate-y-1/2 z-10 hidden sm:flex w-10 h-10 items-center justify-center rounded-full bg-white/90 dark:bg-gray-800/90 shadow-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 transition-colors'

  return (
    <section aria-roledescription="carousel" aria-label="Screenshots">
      <div className="relative">
        <div
          ref={track}
          onScroll={e => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / el.clientWidth)) }}
          className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SLIDES.map((s, i) => (
            <figure key={s.src} className="w-full flex-shrink-0 snap-center" aria-label={`${i + 1} of ${SLIDES.length}`}>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/screenshots/${s.src}.webp`}
                  alt={s.title}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="w-full aspect-[16/10] object-contain bg-gray-50"
                />
              </div>
              <figcaption className="text-center mt-3 px-2">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{s.title}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 text-pretty">{s.text}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        <button type="button" onClick={() => go(index - 1)} className={`${arrow} -left-3`} aria-label="Previous screenshot"><ChevronLeft size={20} /></button>
        <button type="button" onClick={() => go(index + 1)} className={`${arrow} -right-3`} aria-label="Next screenshot"><ChevronRight size={20} /></button>
      </div>
      <div className="flex justify-center gap-1.5 mt-3">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show ${s.title}`}
            aria-current={i === index}
            className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-indigo-600' : 'w-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'}`}
          />
        ))}
      </div>
    </section>
  )
}
