// Reads and writes for activities, their recurring series, and dated occurrences.
import { useLiveQuery } from 'dexie-react-hooks'
import { activityDays, type ActivityItem } from '../domain/activities.ts'
import { localDate } from '../domain/dates.ts'
import { newId } from '../domain/ids.ts'
import type { ActivityOccurrence, ActivityRecord, ActivitySeries, OccurrenceStatus } from '../domain/records.ts'
import { db } from './db.ts'

export interface ActivityData {
  activities: ActivityRecord[]
  series: ActivitySeries[]
  occurrences: ActivityOccurrence[]
}

export function useActivityData(): ActivityData | undefined {
  return useLiveQuery(async () => {
    const [activities, series, occurrences] = await Promise.all([db.activities.toArray(), db.activitySeries.toArray(), db.activityOccurrences.toArray()])
    return { activities: activities.sort((a, b) => a.name.localeCompare(b.name)), series, occurrences }
  })
}

/** Activities for each day from `start` (default today). */
export function useActivityDays(days = 7, start?: string): { date: string; items: ActivityItem[] }[] | undefined {
  const data = useActivityData()
  if (!data) return undefined
  return activityDays(data.series, data.occurrences, data.activities, start ?? localDate(), days)
}

export async function saveActivity(a: Omit<ActivityRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): Promise<string> {
  const id = a.id ?? newId()
  await db.activities.put({ ...a, id, createdAt: a.createdAt ?? Date.now() })
  return id
}

/**
 * Sets which weekdays an activity repeats on (one series per activity keeps the UI simple).
 * An empty list ends the series from today, leaving past history alone.
 */
export async function setRepeatDays(activityId: string, weekdays: number[]): Promise<void> {
  const today = localDate()
  const existing = await db.activitySeries.where('activityId').equals(activityId).filter((s) => !s.endDate || s.endDate >= today).first()
  if (existing) {
    if (weekdays.length === 0) await db.activitySeries.update(existing.id, { endDate: today })
    else await db.activitySeries.update(existing.id, { weekdays: [...weekdays].sort() })
  } else if (weekdays.length > 0) {
    await db.activitySeries.add({ id: newId(), activityId, weekdays: [...weekdays].sort(), startDate: today, exceptions: [] })
  }
}

/** Activities with logged history are archived (keeping their name in history); others are deleted. */
export async function deleteOrArchiveActivity(id: string): Promise<'archived' | 'deleted'> {
  const logged = await db.activityOccurrences.where('activityId').equals(id).filter((o) => o.status !== 'planned').count()
  await db.transaction('rw', db.activities, db.activitySeries, db.activityOccurrences, async () => {
    if (logged > 0) {
      await db.activities.update(id, { archived: true })
      await db.activityOccurrences.where('activityId').equals(id).filter((o) => o.status === 'planned').delete()
    } else {
      await db.activities.delete(id)
      await db.activitySeries.where('activityId').equals(id).delete()
      await db.activityOccurrences.where('activityId').equals(id).delete()
    }
  })
  return logged > 0 ? 'archived' : 'deleted'
}

/** Quick add: a one-off planned occurrence. */
export async function addOneOff(activityId: string, date: string): Promise<void> {
  await db.activityOccurrences.add({ id: newId(), activityId, date, status: 'planned' })
}

/** Log after the fact (or log a past date directly). */
export async function logPastActivity(o: Omit<ActivityOccurrence, 'id'>): Promise<void> {
  await db.activityOccurrences.add({ ...o, id: newId() })
}

/**
 * Writes a change to one activity on the calendar. A projected series instance has no record
 * yet, so the first change creates one that remembers its series date.
 */
async function upsert(item: ActivityItem, changes: Partial<ActivityOccurrence>): Promise<void> {
  if (item.occurrence) await db.activityOccurrences.update(item.occurrence.id, changes)
  else await db.activityOccurrences.add({ id: newId(), activityId: item.activityId, date: item.date, status: 'planned', seriesId: item.seriesId, seriesDate: item.seriesDate, ...changes })
}

export async function logActivity(item: ActivityItem, log: { status: OccurrenceStatus; actualMinutes?: number; rpe?: number; notes?: string }): Promise<void> {
  await upsert(item, log)
}

export async function moveActivity(item: ActivityItem, date: string): Promise<void> {
  await upsert(item, { date })
}

/** Removes one date: deletes a one-off, or adds an exception for a series instance. */
export async function removeActivity(item: ActivityItem): Promise<void> {
  await db.transaction('rw', db.activityOccurrences, db.activitySeries, async () => {
    if (item.occurrence) await db.activityOccurrences.delete(item.occurrence.id)
    if (item.seriesId && item.seriesDate) {
      const s = await db.activitySeries.get(item.seriesId)
      if (s && !s.exceptions.includes(item.seriesDate)) await db.activitySeries.update(s.id, { exceptions: [...s.exceptions, item.seriesDate] })
    }
  })
}
