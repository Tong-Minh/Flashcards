// Study days start at 4 AM local time (like Anki), so a late-night session still counts as the same
// day. Used for daily new-card limits, burying, and stats.

export const NEW_DAY_HOUR = 4

// When the study day containing `at` began
export function studyDayStart(at: Date = new Date(), hour = NEW_DAY_HOUR): Date {
  const start = new Date(at)
  start.setHours(hour, 0, 0, 0)
  if (start > at) start.setDate(start.getDate() - 1)
  return start
}

// When the next study day begins (buried cards come back then)
export function nextStudyDay(at: Date = new Date(), hour = NEW_DAY_HOUR): Date {
  const next = studyDayStart(at, hour)
  next.setDate(next.getDate() + 1)
  return next
}

// The study day as YYYY-MM-DD (local), for grouping and comparing
export function studyDayKey(at: Date | string = new Date(), hour = NEW_DAY_HOUR): string {
  const d = studyDayStart(typeof at === 'string' ? new Date(at) : at, hour)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
