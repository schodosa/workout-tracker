// Activities on the calendar: recurring series projected onto dates, merged with concrete
// occurrences. Pure functions; the database side is db/activities.ts.
import suggestions from '../data/activities.json'
import { addDays, weekday } from './dates.ts'
import type { ActivityOccurrence, ActivityRecord, ActivitySeries, Intensity, LoadLevel, OccurrenceStatus } from './records.ts'

export interface ActivityItem {
  key: string
  activityId: string
  date: string
  status: OccurrenceStatus
  /** The stored record, if this instance has one (one-off, logged, or a touched series date). */
  occurrence?: ActivityOccurrence
  /** For series instances (projected or touched): the series and its original date. */
  seriesId?: string
  seriesDate?: string
}

/** Activity items for each date in [start, start + days). */
export function activityDays(series: ActivitySeries[], occurrences: ActivityOccurrence[], activities: ActivityRecord[], start: string, days: number): { date: string; items: ActivityItem[] }[] {
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i))
  const known = new Set(activities.map((a) => a.id))
  // A series date is "taken" once a concrete record stands for it (logged, skipped, or moved away).
  const taken = new Set(occurrences.filter((o) => o.seriesId && o.seriesDate).map((o) => `${o.seriesId}|${o.seriesDate}`))

  return dates.map((date) => {
    const items: ActivityItem[] = []
    for (const s of series) {
      if (!known.has(s.activityId) || activities.find((a) => a.id === s.activityId)?.archived) continue
      if (date < s.startDate || (s.endDate && date > s.endDate) || !s.weekdays.includes(weekday(date))) continue
      if (s.exceptions.includes(date) || taken.has(`${s.id}|${date}`)) continue
      items.push({ key: `series|${s.id}|${date}`, activityId: s.activityId, date, status: 'planned', seriesId: s.id, seriesDate: date })
    }
    for (const o of occurrences) {
      if (o.date !== date || !known.has(o.activityId)) continue
      items.push({ key: `occ|${o.id}`, activityId: o.activityId, date, status: o.status, occurrence: o, seriesId: o.seriesId, seriesDate: o.seriesDate })
    }
    return { date, items }
  })
}

export const LOAD_LABEL: Record<LoadLevel, string> = { none: 'None', light: 'Light', hard: 'Hard' }
export const INTENSITY_LABEL: Record<Intensity, string> = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' }

/** "Legs hard · cardio hard" (leaves out the "none" parts). */
export function describeLoad(a: Pick<ActivityRecord, 'legLoad' | 'cardioLoad'>): string {
  const parts: string[] = []
  if (a.legLoad !== 'none') parts.push(`legs ${a.legLoad}`)
  if (a.cardioLoad !== 'none') parts.push(`cardio ${a.cardioLoad}`)
  const text = parts.join(' · ') || 'light on the body'
  return text[0].toUpperCase() + text.slice(1)
}

/** Common activities offered in onboarding (built-in content: src/data/activities.json). */
export type ActivitySuggestion = Omit<ActivityRecord, 'id' | 'createdAt' | 'archived'>
export const ACTIVITY_SUGGESTIONS = suggestions as ActivitySuggestion[]
