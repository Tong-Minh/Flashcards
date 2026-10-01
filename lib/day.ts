// Study days start at a set hour (4 AM by default, like Anki; a study setting), so a late-night
// session still counts as the same day. Used for daily new-card limits, burying, and stats.

export const NEW_DAY_HOUR = 4
// Where lib/studySettings caches the settings (read here directly to avoid a circular import)
export const SETTINGS_CACHE_KEY = 'fc_study_settings'

let hour: number | null = null

export function setNewDayHour(h: number) {
  hour = h
}

// The configured hour, read from the settings cache the first time
export function newDayHour(): number {
  if (hour === null) {
    try { hour = (JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) ?? 'null') as { newDayHour?: number } | null)?.newDayHour ?? NEW_DAY_HOUR }
    catch { hour = NEW_DAY_HOUR }
  }
  return hour
}

// When the study day containing `at` began
export function studyDayStart(at: Date = new Date(), h = newDayHour()): Date {
  const start = new Date(at)
  start.setHours(h, 0, 0, 0)
  if (start > at) start.setDate(start.getDate() - 1)
  return start
}

// When the next study day begins (buried cards come back then)
export function nextStudyDay(at: Date = new Date(), h = newDayHour()): Date {
  const next = studyDayStart(at, h)
  next.setDate(next.getDate() + 1)
  return next
}

// The study day as YYYY-MM-DD (local), for grouping and comparing
export function studyDayKey(at: Date | string = new Date(), h = newDayHour()): string {
  const d = studyDayStart(typeof at === 'string' ? new Date(at) : at, h)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
