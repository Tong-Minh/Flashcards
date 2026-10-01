'use client'

import type { ReactNode } from 'react'
import { lastDays, type DayActivity } from '@/lib/stats'

// Small hand-made charts for the Stats page (no chart library): bars are flex boxes, colors are
// Tailwind classes with dark variants.

export function StatsSection({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 lg:p-5 min-w-0">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 text-pretty">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

// A row of small toggle buttons (ranges, units)
export function Segmented<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {options.map(o => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            o.value === value
              ? 'bg-indigo-600 text-white'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/60'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export interface Segment { value: number; className: string; label: string }
export interface BarItem { label: string; segments: Segment[] }

// Vertical bars, each stacked from its segments. `every` labels every nth bar on the x axis.
export function BarChart({ items, every = 1, height = 140, format = (n: number) => String(Math.round(n)) }: {
  items: BarItem[]; every?: number; height?: number; format?: (n: number) => string
}) {
  const max = Math.max(1, ...items.map(i => i.segments.reduce((n, s) => n + s.value, 0)))
  const gap = items.length > 60 ? 'gap-px' : 'gap-0.5'
  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div className="flex flex-col justify-between text-[10px] text-gray-400 dark:text-gray-500 tabular-nums text-right w-7 flex-shrink-0" style={{ height }}>
          <span>{format(max)}</span>
          <span>0</span>
        </div>
        <div className={`flex-1 min-w-0 flex items-end ${gap} border-b border-gray-200 dark:border-gray-700`} style={{ height }}>
          {items.map((item, i) => {
            const total = item.segments.reduce((n, s) => n + s.value, 0)
            const tip = `${item.label}: ${item.segments.filter(s => s.value > 0).map(s => `${format(s.value)} ${s.label}`).join(', ') || '0'}`
            return (
              <div key={i} className="flex-1 min-w-0 h-full flex flex-col justify-end group" title={tip}>
                <div className="flex flex-col-reverse rounded-t-sm overflow-hidden group-hover:opacity-80" style={{ height: `${(total / max) * 100}%` }}>
                  {item.segments.map((s, j) => s.value > 0 && (
                    <div key={j} className={s.className} style={{ height: `${(s.value / total) * 100}%` }} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className={`flex ${gap} ml-9 mt-1`}>
        {items.map((item, i) => (
          <div key={i} className="flex-1 min-w-0 text-[10px] text-gray-400 dark:text-gray-500 text-center whitespace-nowrap overflow-visible">
            {i % every === 0 ? item.label : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Legend({ items }: { items: { className: string; label: string; value?: string | number }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className={`w-2.5 h-2.5 rounded-sm ${i.className}`} />
          {i.label}{i.value !== undefined && <span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">{i.value}</span>}
        </span>
      ))}
    </div>
  )
}

// One horizontal bar split into parts (card counts)
export function StackedBar({ parts }: { parts: { value: number; className: string; label: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0)
  if (total === 0) return <div className="h-4 rounded-full bg-gray-100 dark:bg-gray-700" />
  return (
    <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
      {parts.map(p => p.value > 0 && (
        <div key={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />
      ))}
    </div>
  )
}

const HEAT = [
  'bg-gray-100 dark:bg-gray-700/60',
  'bg-indigo-200 dark:bg-indigo-900',
  'bg-indigo-300 dark:bg-indigo-700',
  'bg-indigo-500 dark:bg-indigo-500',
  'bg-indigo-700 dark:bg-indigo-300',
]

// A year of study days, one square per day, weeks as columns (GitHub-style)
export function Heatmap({ days, now = new Date() }: { days: Map<string, DayActivity>; now?: Date }) {
  const keys = lastDays(53 * 7, now)
  // Start the first column on a Sunday so rows are weekdays
  const firstWeekday = new Date(`${keys[0]}T12:00:00`).getDay()
  const cells: (string | null)[] = [...Array<null>(firstWeekday).fill(null), ...keys]
  const columns: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7))
  const counts = keys.map(k => days.get(k)?.reviews ?? 0).filter(n => n > 0).sort((a, b) => a - b)
  // Shade by quartile of the user's own days, so light and heavy studiers both get a range
  const q = (f: number) => counts[Math.floor(f * (counts.length - 1))] ?? 1
  const level = (n: number) => (n === 0 ? 0 : n <= q(0.25) ? 1 : n <= q(0.5) ? 2 : n <= q(0.75) ? 3 : 4)
  const monthLabel = (col: (string | null)[], i: number) => {
    const first = col.find(Boolean)
    if (!first) return ''
    const d = new Date(`${first}T12:00:00`)
    return d.getDate() <= 7 && i > 0 ? d.toLocaleDateString(undefined, { month: 'short' }) : ''
  }
  return (
    // Starts scrolled to the end, so today is in view when the year doesn't fit
    <div ref={el => { if (el) el.scrollLeft = el.scrollWidth }} className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="inline-flex flex-col gap-1 min-w-max">
        <div className="flex gap-[3px] text-[10px] text-gray-400 dark:text-gray-500 h-3">
          {columns.map((col, i) => <div key={i} className="w-[11px] overflow-visible whitespace-nowrap">{monthLabel(col, i)}</div>)}
        </div>
        <div className="flex gap-[3px]">
          {columns.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.map((key, j) => key === null
                ? <div key={j} className="w-[11px] h-[11px]" />
                : (
                  <div
                    key={j}
                    className={`w-[11px] h-[11px] rounded-[2px] ${HEAT[level(days.get(key)?.reviews ?? 0)]}`}
                    title={`${new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}: ${days.get(key)?.reviews ?? 0} cards`}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
