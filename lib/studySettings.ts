// The user's study settings, cached in localStorage so study works offline and starts instantly,
// and the FSRS scheduler built from them.
import { fsrs, generatorParameters, type FSRS } from 'ts-fsrs'
import { store } from '@/lib/store'
import { setNewDayHour, SETTINGS_CACHE_KEY } from '@/lib/day'
import { DEFAULT_STUDY_SETTINGS, type FlashcardSet, type StudySettings } from '@/lib/types'

const withDefaults = (s: Partial<StudySettings> | null | undefined): StudySettings => ({ ...DEFAULT_STUDY_SETTINGS, ...(s ?? {}) })

export function cachedSettings(): StudySettings {
  try { return withDefaults(JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) ?? 'null')) } catch { return withDefaults(null) }
}

function cache(s: StudySettings) {
  try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(s)) } catch {}
  setNewDayHour(s.newDayHour)
}

// Fresh from the store (falls back to the cache offline)
export async function loadSettings(): Promise<StudySettings> {
  try {
    const s = withDefaults(await store.getSettings())
    cache(s)
    return s
  } catch {
    return cachedSettings()
  }
}

export async function saveSettings(patch: Partial<StudySettings>): Promise<StudySettings> {
  const next = { ...cachedSettings(), ...patch }
  await store.saveSettings(next)
  cache(next)
  return next
}

// A set's target retention: its own, or the user's default
export function retentionFor(set: Pick<FlashcardSet, 'desired_retention'> | null | undefined, settings = cachedSettings()): number {
  return set?.desired_retention ?? settings.desiredRetention
}

export function scheduler(retention: number, settings = cachedSettings()): FSRS {
  return fsrs(generatorParameters({
    request_retention: retention,
    ...(settings.fsrsParams && settings.fsrsParams.length >= 19 && { w: settings.fsrsParams }),
  }))
}

// Choices offered for target retention (Anki allows 0.70–0.99; past 0.97 the workload explodes)
export const RETENTION_CHOICES = [0.8, 0.85, 0.87, 0.9, 0.92, 0.95, 0.97]
